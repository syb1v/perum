"""Node management: CRUD, capacity planning, bootstrap scripts."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import require_org_admin, require_platform_admin
from app.models import Node, NodeAssignment, Organization, School
from app.schemas.node import (
    BootstrapScriptResponse,
    CapacityRecommendationRequest,
    CapacityRecommendationResponse,
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


@platform_router.get("/{node_id}/schools")
async def get_node_schools(node_id: int, db: AsyncSession = Depends(get_db)) -> dict:
    node = await db.get(Node, node_id)
    if not node:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Node not found")

    result = await db.execute(
        select(NodeAssignment, School)
        .join(School, NodeAssignment.school_id == School.id)
        .where(NodeAssignment.node_id == node.id)
        .order_by(NodeAssignment.assigned_at)
    )
    rows = result.all()

    schools = []
    for assignment, school in rows:
        schools.append({
            "school_id": school.id,
            "school_slug": school.slug,
            "school_name": school.name,
            "status": school.status,
            "assigned_at": assignment.assigned_at.isoformat(),
        })

    return {"node_id": node_id, "schools": schools, "total": len(schools)}


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
