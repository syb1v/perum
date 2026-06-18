"""Агент орг: статус узла + управление школами на ноде."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.schemas import (
    AgentDeprovisionSchoolRequest,
    AgentHealthResponse,
    AgentHeartbeatRequest,
    AgentHeartbeatResponse,
    AgentProvisionSchoolRequest,
    AgentProvisionSchoolResponse,
    AgentSchoolActionResponse,
    AgentSchoolListResponse,
    AgentSuspendSchoolRequest,
    AgentUpdateSchoolRequest,
    AgentUpdateSchoolResponse,
)
from app.agent.service import (
    deprovision_school_on_node,
    get_agent_health,
    get_agent_schools,
    get_agent_state,
    provision_school_on_node,
    send_heartbeat,
    suspend_school_on_node,
    unsuspend_school_on_node,
    update_school_on_node,
)
from app.core.config import get_settings
from app.core.db import get_db

router = APIRouter()


@router.get("/whoami")
async def whoami(db: AsyncSession = Depends(get_db)) -> dict:
    settings = get_settings()
    state = await get_agent_state(db) if settings.ROLE == "org_agent" else None
    return {
        "role": settings.ROLE,
        "enrolled": state is not None,
        "org_slug": state.org_slug if state else None,
        "org_name": state.org_name if state else None,
        "release_tag": state.release_tag if state else None,
        "core_url": settings.CORE_URL if settings.ROLE == "org_agent" else None,
    }


@router.get("/health", response_model=AgentHealthResponse)
async def health(db: AsyncSession = Depends(get_db)) -> AgentHealthResponse:
    if get_settings().ROLE != "org_agent":
        raise HTTPException(400, "health endpoint only available in org_agent mode")
    return await get_agent_health(db)


@router.get("/schools", response_model=AgentSchoolListResponse)
async def list_schools(db: AsyncSession = Depends(get_db)) -> AgentSchoolListResponse:
    if get_settings().ROLE != "org_agent":
        raise HTTPException(400, "schools endpoint only available in org_agent mode")
    return await get_agent_schools(db)


@router.post("/schools/provision", response_model=AgentProvisionSchoolResponse)
async def provision_school(
    req: AgentProvisionSchoolRequest,
    db: AsyncSession = Depends(get_db),
) -> AgentProvisionSchoolResponse:
    if get_settings().ROLE != "org_agent":
        raise HTTPException(400, "provision only available in org_agent mode")
    return await provision_school_on_node(db, req)


@router.post("/schools/{school_slug}/update", response_model=AgentUpdateSchoolResponse)
async def update_school(
    school_slug: str,
    req: AgentUpdateSchoolRequest,
    db: AsyncSession = Depends(get_db),
) -> AgentUpdateSchoolResponse:
    if get_settings().ROLE != "org_agent":
        raise HTTPException(400, "update only available in org_agent mode")
    req.school_slug = school_slug
    return await update_school_on_node(db, req)


@router.post("/schools/{school_slug}/suspend", response_model=AgentSchoolActionResponse)
async def suspend_school(
    school_slug: str,
    db: AsyncSession = Depends(get_db),
) -> AgentSchoolActionResponse:
    if get_settings().ROLE != "org_agent":
        raise HTTPException(400, "suspend only available in org_agent mode")
    return await suspend_school_on_node(db, school_slug)


@router.post("/schools/{school_slug}/unsuspend", response_model=AgentSchoolActionResponse)
async def unsuspend_school(
    school_slug: str,
    db: AsyncSession = Depends(get_db),
) -> AgentSchoolActionResponse:
    if get_settings().ROLE != "org_agent":
        raise HTTPException(400, "unsuspend only available in org_agent mode")
    return await unsuspend_school_on_node(db, school_slug)


@router.post("/schools/{school_slug}/deprovision", response_model=AgentSchoolActionResponse)
async def deprovision_school(
    school_slug: str,
    req: AgentDeprovisionSchoolRequest,
    db: AsyncSession = Depends(get_db),
) -> AgentSchoolActionResponse:
    if get_settings().ROLE != "org_agent":
        raise HTTPException(400, "deprovision only available in org_agent mode")
    req.school_slug = school_slug
    return await deprovision_school_on_node(db, req)


@router.post("/heartbeat", response_model=AgentHeartbeatResponse)
async def heartbeat(
    req: AgentHeartbeatRequest,
    db: AsyncSession = Depends(get_db),
) -> AgentHeartbeatResponse:
    if get_settings().ROLE != "org_agent":
        raise HTTPException(400, "heartbeat only available in org_agent mode")
    return await send_heartbeat(db, req)
