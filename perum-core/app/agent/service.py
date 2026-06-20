"""Агент организации (ROLE=org_agent): enroll-on-boot + управление школами на ноде.

При старте узел орг предъявляет свой ENROLLMENT_TOKEN ядру (`POST /api/enroll`),
получает org_slug + текущий релиз и сохраняет локально (`agent_state`). Идемпотентно:
если уже подключён — ничего не делает. Ошибки не валят старт (повтор на следующем
старте).
"""

from __future__ import annotations

import logging
import time
from datetime import datetime, timezone

import httpx
import psutil
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.schemas import (
    AgentDeprovisionSchoolRequest,
    AgentHealthResponse,
    AgentHeartbeatRequest,
    AgentHeartbeatResponse,
    AgentProvisionSchoolRequest,
    AgentProvisionSchoolResponse,
    AgentSchoolActionResponse,
    AgentSchoolInfo,
    AgentSchoolListResponse,
    AgentUpdateSchoolRequest,
    AgentUpdateSchoolResponse,
)
from app.core.config import get_settings
from app.core.db import SessionLocal
from app.core.docker_client import DockerClient
from app.models import AgentState
from app.services.school_provisioner import (
    deprovision_school,
    provision_school,
    suspend_school,
    unsuspend_school,
    update_school,
)

logger = logging.getLogger("perum.agent")


async def get_agent_state(db: AsyncSession) -> AgentState | None:
    return await db.scalar(select(AgentState).limit(1))


async def enroll_on_boot() -> None:
    settings = get_settings()
    if settings.ROLE != "org_agent":
        return
    try:
        async with SessionLocal() as db:
            existing = await get_agent_state(db)
            if existing is not None:
                logger.info("agent: уже подключён к орг '%s'", existing.org_slug)
                return
            if not settings.ENROLLMENT_TOKEN:
                logger.warning("agent: ENROLLMENT_TOKEN не задан — пропускаю enroll")
                return

            # Снять реальные характеристики сервера и сообщить их ядру — оператор не
            # вводит CPU/RAM/диск вручную, нода сама себя «представляет» при подключении.
            try:
                cpu_cores = psutil.cpu_count(logical=True) or psutil.cpu_count() or 1
                ram_gb = round(psutil.virtual_memory().total / (1024 ** 3), 1)
                disk_gb = round(psutil.disk_usage("/").total / (1024 ** 3), 1)
            except Exception:  # psutil может не дать данные в нестандартном окружении
                cpu_cores = ram_gb = disk_gb = None

            url = f"{settings.CORE_URL.rstrip('/')}/api/enroll"
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(url, json={
                    "token": settings.ENROLLMENT_TOKEN,
                    "cpu_cores": cpu_cores,
                    "ram_gb": ram_gb,
                    "disk_gb": disk_gb,
                    "agent_version": "1.0.0",
                })
            if resp.status_code >= 300:
                logger.error("agent: enroll не удался: %s %s", resp.status_code, resp.text[:300])
                return
            data = resp.json()
            rel = (data.get("current_release") or {})
            db.add(AgentState(
                id=1,
                org_slug=data["org_slug"],
                org_name=data.get("org_name"),
                core_url=settings.CORE_URL,
                release_tag=rel.get("image") or rel.get("version_tag"),
            ))
            await db.commit()
            logger.info("agent: подключён к орг '%s' (релиз %s)", data["org_slug"], rel.get("version_tag"))
    except Exception as exc:
        logger.warning("agent: enroll-on-boot отложен: %s", exc)


async def get_agent_health(db: AsyncSession) -> AgentHealthResponse:
    state = await get_agent_state(db)
    docker = DockerClient()
    containers = await docker.list_containers(all=True)
    school_containers = [c for c in containers if c.get("Labels", {}).get("com.perum.type") == "school"]
    schools_count = len(set(c.get("Labels", {}).get("com.perum.school") for c in school_containers if c.get("Labels", {}).get("com.perum.school")))

    cpu_percent = psutil.cpu_percent(interval=0.1)
    mem = psutil.virtual_memory()
    disk = psutil.disk_usage("/")

    return AgentHealthResponse(
        node_name=state.org_slug if state else None,
        status="active" if state else "pending",
        schools_count=schools_count,
        cpu_percent=cpu_percent,
        ram_used_mb=mem.used // (1024 * 1024),
        ram_total_mb=mem.total // (1024 * 1024),
        disk_used_gb=round(disk.used / (1024 ** 3), 2),
        disk_total_gb=round(disk.total / (1024 ** 3), 2),
        uptime_seconds=int(time.time() - psutil.boot_time()),
        agent_version="1.0.0",
        timestamp=datetime.now(timezone.utc),
    )


async def get_agent_schools(db: AsyncSession) -> AgentSchoolListResponse:
    docker = DockerClient()
    containers = await docker.list_containers(all=True)

    schools_map: dict[str, AgentSchoolInfo] = {}
    for c in containers:
        labels = c.get("Labels", {})
        if labels.get("com.perum.type") != "school":
            continue
        slug = labels.get("com.perum.school")
        if not slug:
            continue
        if slug not in schools_map:
            schools_map[slug] = AgentSchoolInfo(
                slug=slug,
                status="unknown",
                release_tag=labels.get("com.perum.release"),
                containers=[],
            )
        schools_map[slug].containers.append(c.get("Names", ["unknown"])[0].lstrip("/"))
        state = c.get("State", "unknown")
        if state == "running":
            schools_map[slug].status = "active"
        elif state == "exited":
            schools_map[slug].status = "stopped"

    return AgentSchoolListResponse(schools=list(schools_map.values()), total=len(schools_map))


async def provision_school_on_node(
    db: AsyncSession, req: AgentProvisionSchoolRequest
) -> AgentProvisionSchoolResponse:
    try:
        state = await get_agent_state(db)
        if not state:
            return AgentProvisionSchoolResponse(
                success=False, school_slug=req.school_slug, message="Agent not enrolled"
            )

        from app.models import School
        school = School(
            org_id=state.org_id if hasattr(state, 'org_id') else None,
            slug=req.school_slug,
            name=req.school_name,
            status="provisioning",
        )
        db.add(school)
        await db.commit()
        await db.refresh(school)
        await provision_school(school, db)
        return AgentProvisionSchoolResponse(
            success=True, school_slug=req.school_slug, message="School provisioned successfully"
        )
    except Exception as exc:
        logger.error("provision_school_on_node failed: %s", exc)
        return AgentProvisionSchoolResponse(
            success=False, school_slug=req.school_slug, message=str(exc)
        )


async def update_school_on_node(
    db: AsyncSession, req: AgentUpdateSchoolRequest
) -> AgentUpdateSchoolResponse:
    try:
        from sqlalchemy import select
        from app.models import School
        school = await db.scalar(select(School).where(School.slug == req.school_slug))
        if not school:
            return AgentUpdateSchoolResponse(
                success=False, school_slug=req.school_slug, message="School not found"
            )
        outcome = await update_school(school, db)
        return AgentUpdateSchoolResponse(
            success=True,
            school_slug=req.school_slug,
            rolled_back=outcome.rolled_back if hasattr(outcome, 'rolled_back') else False,
            message="School updated successfully",
        )
    except Exception as exc:
        logger.error("update_school_on_node failed: %s", exc)
        return AgentUpdateSchoolResponse(
            success=False, school_slug=req.school_slug, message=str(exc)
        )


async def suspend_school_on_node(
    db: AsyncSession, school_slug: str
) -> AgentSchoolActionResponse:
    try:
        from sqlalchemy import select
        from app.models import School
        school = await db.scalar(select(School).where(School.slug == school_slug))
        if not school:
            return AgentSchoolActionResponse(
                success=False, school_slug=school_slug, message="School not found"
            )
        await suspend_school(school, db)
        return AgentSchoolActionResponse(
            success=True, school_slug=school_slug, message="School suspended"
        )
    except Exception as exc:
        logger.error("suspend_school_on_node failed: %s", exc)
        return AgentSchoolActionResponse(
            success=False, school_slug=school_slug, message=str(exc)
        )


async def unsuspend_school_on_node(
    db: AsyncSession, school_slug: str
) -> AgentSchoolActionResponse:
    try:
        from sqlalchemy import select
        from app.models import School
        school = await db.scalar(select(School).where(School.slug == school_slug))
        if not school:
            return AgentSchoolActionResponse(
                success=False, school_slug=school_slug, message="School not found"
            )
        await unsuspend_school(school, db)
        return AgentSchoolActionResponse(
            success=True, school_slug=school_slug, message="School unsuspended"
        )
    except Exception as exc:
        logger.error("unsuspend_school_on_node failed: %s", exc)
        return AgentSchoolActionResponse(
            success=False, school_slug=school_slug, message=str(exc)
        )


async def deprovision_school_on_node(
    db: AsyncSession, req: AgentDeprovisionSchoolRequest
) -> AgentSchoolActionResponse:
    try:
        from sqlalchemy import select
        from app.models import School
        school = await db.scalar(select(School).where(School.slug == req.school_slug))
        if not school:
            return AgentSchoolActionResponse(
                success=False, school_slug=req.school_slug, message="School not found"
            )
        await deprovision_school(school, db, purge=(req.mode == "purge"))
        return AgentSchoolActionResponse(
            success=True, school_slug=req.school_slug, message=f"School {req.mode}d"
        )
    except Exception as exc:
        logger.error("deprovision_school_on_node failed: %s", exc)
        return AgentSchoolActionResponse(
            success=False, school_slug=req.school_slug, message=str(exc)
        )


async def send_heartbeat(
    db: AsyncSession, req: AgentHeartbeatRequest
) -> AgentHeartbeatResponse:
    try:
        state = await get_agent_state(db)
        if not state:
            return AgentHeartbeatResponse(success=False, node_id=None)

        settings = get_settings()
        url = f"{settings.CORE_URL.rstrip('/')}/internal/heartbeat"
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                url,
                json={
                    "org_slug": state.org_slug,
                    "node_name": req.node_name,
                    "schools_count": req.schools_count,
                    "cpu_percent": req.cpu_percent,
                    "ram_used_mb": req.ram_used_mb,
                    "ram_total_mb": req.ram_total_mb,
                    "disk_used_gb": req.disk_used_gb,
                    "disk_total_gb": req.disk_total_gb,
                    "agent_version": req.agent_version,
                },
            )
        if resp.status_code >= 300:
            logger.warning("heartbeat failed: %s", resp.status_code)
            return AgentHeartbeatResponse(success=False, node_id=None)

        data = resp.json()
        return AgentHeartbeatResponse(success=True, node_id=data.get("node_id"))
    except Exception as exc:
        logger.warning("send_heartbeat failed: %s", exc)
        return AgentHeartbeatResponse(success=False, node_id=None)
