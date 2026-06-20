"""Node management: CRUD, capacity planning, bootstrap scripts."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import get_db
from app.core.deps import require_org_admin, require_platform_admin
from app.models import Node, NodeAssignment, Organization, School, SchoolDomain
from app.schemas.node import (
    BootstrapScriptResponse,
    CapacityRecommendationRequest,
    CapacityRecommendationResponse,
    NodeActionResult,
    NodeBulkActionRequest,
    NodeBulkActionResponse,
    NodeCreate,
    NodeListResponse,
    NodeResponse,
    NodeUpdate,
    NodeUtilizationResponse,
    UpdateHistoryListResponse,
    UpdateHistoryResponse,
)
from app.services.node_bootstrap import generate_bootstrap_script
from app.services.node_planner import NodePlanner
from app.services.remote_node_client import RemoteNodeClient, RemoteNodeError

logger = logging.getLogger("perum.nodes")


platform_router = APIRouter(prefix="/platform/nodes", dependencies=[Depends(require_platform_admin)])
capacity_router = APIRouter(prefix="/platform/capacity", dependencies=[Depends(require_platform_admin)])
org_nodes_router = APIRouter(prefix="/org/nodes", dependencies=[Depends(require_org_admin)])


# ============================================================================
# Platform Admin: Node CRUD
# ============================================================================


@platform_router.get("", response_model=NodeListResponse)
async def list_nodes(
    db: AsyncSession = Depends(get_db),
    org_id: int | None = None,
    status_filter: str | None = None,
) -> NodeListResponse:
    query = select(Node)
    if org_id is not None:
        query = query.where(Node.org_id == org_id)
    if status_filter is not None:
        query = query.where(Node.status == status_filter)
    query = query.order_by(Node.created_at.desc())

    result = await db.execute(query)
    nodes = result.scalars().all()

    return NodeListResponse(
        nodes=[NodeResponse.model_validate(n) for n in nodes],
        total=len(nodes),
    )


@platform_router.post("", response_model=NodeResponse, status_code=status.HTTP_201_CREATED)
async def create_node(payload: NodeCreate, db: AsyncSession = Depends(get_db)) -> NodeResponse:
    existing = await db.scalar(select(Node).where(Node.hostname == payload.hostname))
    if existing:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Node with hostname '{payload.hostname}' already exists",
        )

    node = Node(
        name=payload.name,
        hostname=payload.hostname,
        ssh_port=payload.ssh_port,
        cpu_cores=payload.cpu_cores,
        ram_gb=payload.ram_gb,
        disk_gb=payload.disk_gb,
        country_code=payload.country_code,
        org_id=payload.org_id,
        max_schools=payload.max_schools,
        status="pending_bootstrap",
    )
    db.add(node)
    await db.commit()
    await db.refresh(node)

    return NodeResponse.model_validate(node)


@platform_router.get("/{node_id}", response_model=NodeResponse)
async def get_node(node_id: int, db: AsyncSession = Depends(get_db)) -> NodeResponse:
    node = await db.get(Node, node_id)
    if not node:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Node not found")
    return NodeResponse.model_validate(node)


@platform_router.patch("/{node_id}", response_model=NodeResponse)
async def update_node(node_id: int, payload: NodeUpdate, db: AsyncSession = Depends(get_db)) -> NodeResponse:
    node = await db.get(Node, node_id)
    if not node:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Node not found")

    if payload.name is not None:
        node.name = payload.name
    if payload.hostname is not None:
        # hostname уникален — не дать «занять» адрес другой ноды.
        clash = await db.scalar(
            select(Node).where(Node.hostname == payload.hostname, Node.id != node.id)
        )
        if clash:
            raise HTTPException(status.HTTP_409_CONFLICT, f"хост '{payload.hostname}' уже занят другой нодой")
        node.hostname = payload.hostname
    if payload.ssh_port is not None:
        node.ssh_port = payload.ssh_port
    if payload.country_code is not None:
        node.country_code = payload.country_code or None
    if payload.max_schools is not None:
        node.max_schools = payload.max_schools
    if payload.enabled is not None:
        node.enabled = payload.enabled
    if payload.status is not None:
        if payload.status not in ("pending_bootstrap", "active", "draining", "offline", "decommissioned"):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid status")
        node.status = payload.status

    await db.commit()
    await db.refresh(node)
    return NodeResponse.model_validate(node)


@platform_router.delete("/{node_id}")
async def delete_node(node_id: int, db: AsyncSession = Depends(get_db)) -> dict:
    node = await db.get(Node, node_id)
    if not node:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Node not found")

    assignments_count = await db.scalar(
        select(func.count()).select_from(NodeAssignment).where(NodeAssignment.node_id == node.id)
    )
    if assignments_count and assignments_count > 0:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Cannot delete node with {assignments_count} assigned schools. Drain or reassign first.",
        )

    await db.delete(node)
    await db.commit()
    return {"id": node_id, "deleted": True}


@platform_router.post("/{node_id}/drain")
async def drain_node(node_id: int, db: AsyncSession = Depends(get_db)) -> dict:
    node = await db.get(Node, node_id)
    if not node:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Node not found")
    if node.status != "active":
        raise HTTPException(status.HTTP_409_CONFLICT, f"Cannot drain node in status '{node.status}'")

    node.status = "draining"
    await db.commit()
    return {"id": node_id, "status": "draining", "message": "Node marked for draining"}


# ============================================================================
# Управление питанием/использованием нод: вкл/выкл (визуально) + рестарт стека
# ============================================================================


async def _set_node_enabled(node: Node, enabled: bool, db: AsyncSession) -> None:
    node.enabled = enabled
    await db.commit()


async def _restart_node_stack(node: Node) -> tuple[bool, str]:
    """Перезагрузить docker-стек школ на ноде через её воркер. Физический сервер не
    трогаем. Возвращает (ok, message)."""
    try:
        result = await RemoteNodeClient().restart_node(node)
        return True, result.get("message") or "перезагружено"
    except RemoteNodeError as exc:
        return False, str(exc)
    except Exception as exc:  # noqa: BLE001
        return False, f"нода недоступна: {exc}"


@platform_router.post("/{node_id}/enable")
async def enable_node(node_id: int, db: AsyncSession = Depends(get_db)) -> dict:
    node = await db.get(Node, node_id)
    if not node:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Node not found")
    await _set_node_enabled(node, True, db)
    return {"id": node_id, "enabled": True, "message": "Нода включена — снова участвует в распределении"}


@platform_router.post("/{node_id}/disable")
async def disable_node(node_id: int, db: AsyncSession = Depends(get_db)) -> dict:
    node = await db.get(Node, node_id)
    if not node:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Node not found")
    await _set_node_enabled(node, False, db)
    return {"id": node_id, "enabled": False, "message": "Нода выключена — новые школы на неё не назначаются"}


@platform_router.post("/{node_id}/restart")
async def restart_node(node_id: int, db: AsyncSession = Depends(get_db)) -> dict:
    node = await db.get(Node, node_id)
    if not node:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Node not found")
    ok, message = await _restart_node_stack(node)
    if not ok:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"перезагрузка не удалась: {message}")
    return {"id": node_id, "ok": True, "message": message}


@platform_router.post("/bulk", response_model=NodeBulkActionResponse)
async def bulk_node_action(payload: NodeBulkActionRequest, db: AsyncSession = Depends(get_db)) -> NodeBulkActionResponse:
    """Массовая операция над нодами: action ∈ {enable, disable, restart},
    scope ∈ {all (все), pool (без организации), org (ноды organization org_id)}."""
    if payload.action not in ("enable", "disable", "restart"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "action: enable | disable | restart")

    query = select(Node).where(Node.status != "decommissioned")
    if payload.scope == "pool":
        query = query.where(Node.org_id.is_(None))
    elif payload.scope == "org":
        if payload.org_id is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "scope=org требует org_id")
        query = query.where(Node.org_id == payload.org_id)
    elif payload.scope != "all":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "scope: all | pool | org")

    nodes = (await db.execute(query.order_by(Node.id))).scalars().all()

    results: list[NodeActionResult] = []
    for node in nodes:
        if payload.action == "enable":
            node.enabled = True
            results.append(NodeActionResult(node_id=node.id, node_name=node.name, ok=True, message="включена"))
        elif payload.action == "disable":
            node.enabled = False
            results.append(NodeActionResult(node_id=node.id, node_name=node.name, ok=True, message="выключена"))
        else:  # restart
            ok, message = await _restart_node_stack(node)
            results.append(NodeActionResult(node_id=node.id, node_name=node.name, ok=ok, message=message))

    if payload.action in ("enable", "disable"):
        await db.commit()

    succeeded = sum(1 for r in results if r.ok)
    return NodeBulkActionResponse(
        action=payload.action, scope=payload.scope,
        total=len(results), succeeded=succeeded, results=results,
    )


@platform_router.get("/{node_id}/schools")
async def get_node_schools(node_id: int, db: AsyncSession = Depends(get_db)) -> dict:
    node = await db.get(Node, node_id)
    if not node:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Node not found")

    result = await db.execute(
        select(NodeAssignment, School, Organization)
        .join(School, NodeAssignment.school_id == School.id)
        .join(Organization, School.org_id == Organization.id, isouter=True)
        .where(NodeAssignment.node_id == node.id)
        .order_by(NodeAssignment.assigned_at)
    )
    rows = result.all()

    base = get_settings().PUBLIC_BASE_DOMAIN
    school_ids = [s.id for _, s, _ in rows]
    # Кастомные домены школ — одним запросом, чтобы показать рядом с поддоменом.
    custom_map: dict[int, list[str]] = {}
    if school_ids:
        dom_rows = (
            await db.execute(
                select(SchoolDomain.school_id, SchoolDomain.domain)
                .where(
                    SchoolDomain.school_id.in_(school_ids),
                    SchoolDomain.domain_type == "custom",
                    SchoolDomain.status != "removed",
                )
            )
        ).all()
        for sid, dom in dom_rows:
            custom_map.setdefault(sid, []).append(dom)

    schools = []
    for assignment, school, org in rows:
        schools.append({
            "school_id": school.id,
            "school_slug": school.slug,
            "school_name": school.name,
            "status": school.status,
            "subdomain": f"{school.slug}.{base}",
            "custom_domains": custom_map.get(school.id, []),
            "node_ip": node.hostname,          # адрес/IP ноды, где лежит школа
            "version": school.release_tag,     # версия образа тенанта
            "org_id": org.id if org else None,
            "org_name": org.name if org else None,
            "org_slug": org.slug if org else None,
            "assigned_at": assignment.assigned_at.isoformat(),
        })

    return {
        "node_id": node_id,
        "node_name": node.name,
        "node_ip": node.hostname,
        "org_id": node.org_id,
        "schools": schools,
        "total": len(schools),
    }


@platform_router.get("/{node_id}/utilization", response_model=NodeUtilizationResponse)
async def get_node_utilization(node_id: int, db: AsyncSession = Depends(get_db)) -> NodeUtilizationResponse:
    node = await db.get(Node, node_id)
    if not node:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Node not found")

    planner = NodePlanner(db)
    return await planner.get_utilization(node)


@platform_router.api_route("/{node_id}/bootstrap-script", methods=["GET", "POST"], response_model=BootstrapScriptResponse, operation_id="generate_node_bootstrap_script")
async def generate_node_bootstrap_script(node_id: int, db: AsyncSession = Depends(get_db)) -> BootstrapScriptResponse:
    node = await db.get(Node, node_id)
    if not node:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Node not found")

    org = None
    if node.org_id:
        org = await db.get(Organization, node.org_id)

    result = await generate_bootstrap_script(db, node, org)

    return BootstrapScriptResponse(
        filename=f"perum-node-{node.name}-bootstrap.sh",
        content=result.script,
        instructions=f"Run on target server: bash perum-node-{node.name}-bootstrap.sh",
        docker_compose=result.docker_compose,
        enrollment_token=result.enrollment_token,
    )


# ============================================================================
# Platform Admin: Capacity Planning
# ============================================================================


@capacity_router.get("/recommendation", response_model=CapacityRecommendationResponse)
async def get_capacity_recommendation(
    req: CapacityRecommendationRequest = Depends(),
    db: AsyncSession = Depends(get_db),
) -> CapacityRecommendationResponse:
    planner = NodePlanner(db)
    return planner.recommend(req.school_count)


# ============================================================================
# Org Admin: View own nodes
# ============================================================================


@org_nodes_router.get("", response_model=NodeListResponse)
async def list_org_nodes(
    db: AsyncSession = Depends(get_db),
    org: Organization = Depends(require_org_admin),
) -> NodeListResponse:
    result = await db.execute(
        select(Node).where(Node.org_id == org.id).order_by(Node.created_at.desc())
    )
    nodes = result.scalars().all()

    return NodeListResponse(
        nodes=[NodeResponse.model_validate(n) for n in nodes],
        total=len(nodes),
    )


@org_nodes_router.get("/{node_id}", response_model=NodeResponse)
async def get_org_node(
    node_id: int,
    db: AsyncSession = Depends(get_db),
    org: Organization = Depends(require_org_admin),
) -> NodeResponse:
    node = await db.get(Node, node_id)
    if not node or node.org_id != org.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Node not found")
    return NodeResponse.model_validate(node)


@org_nodes_router.get("/{node_id}/utilization", response_model=NodeUtilizationResponse)
async def get_org_node_utilization(
    node_id: int,
    db: AsyncSession = Depends(get_db),
    org: Organization = Depends(require_org_admin),
) -> NodeUtilizationResponse:
    node = await db.get(Node, node_id)
    if not node or node.org_id != org.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Node not found")

    planner = NodePlanner(db)
    return await planner.get_utilization(node)
