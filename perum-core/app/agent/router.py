"""Агент орг: статус узла + управление школами на ноде."""

from __future__ import annotations

import secrets as _secrets

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.schemas import (
    AgentDeprovisionSchoolRequest,
    AgentHealthResponse,
    AgentHeartbeatRequest,
    AgentHeartbeatResponse,
    AgentInternalRpcRequest,
    AgentInternalRpcResponse,
    AgentLandingRequest,
    AgentLandingResponse,
    AgentNodeActionResponse,
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
    deprovision_landing_on_node,
    get_agent_state,
    internal_rpc_on_node,
    provision_landing_on_node,
    provision_school_on_node,
    restart_node_stack,
    send_heartbeat,
    suspend_school_on_node,
    unsuspend_school_on_node,
    update_school_on_node,
)
from app.core.config import get_settings
from app.core.db import get_db

router = APIRouter()


async def require_agent_token(authorization: str | None = Header(default=None)) -> None:
    """Аутентификация запросов ядро→воркер по общему секрету AGENT_TOKEN. Если токен
    в настройках не задан (dev) — проверка пропускается. Вешается на мутирующие
    эндпоинты управления школами; /whoami и /health остаются открытыми (liveness)."""
    token = get_settings().AGENT_TOKEN
    if not token:
        return
    presented = ""
    if authorization and authorization.lower().startswith("bearer "):
        presented = authorization[7:]
    if not _secrets.compare_digest(presented, token):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid agent token")


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


@router.post("/schools/provision", response_model=AgentProvisionSchoolResponse, dependencies=[Depends(require_agent_token)])
async def provision_school(
    req: AgentProvisionSchoolRequest,
    db: AsyncSession = Depends(get_db),
) -> AgentProvisionSchoolResponse:
    if get_settings().ROLE != "org_agent":
        raise HTTPException(400, "provision only available in org_agent mode")
    return await provision_school_on_node(db, req)


@router.post("/schools/{school_slug}/update", response_model=AgentUpdateSchoolResponse, dependencies=[Depends(require_agent_token)])
async def update_school(
    school_slug: str,
    req: AgentUpdateSchoolRequest,
    db: AsyncSession = Depends(get_db),
) -> AgentUpdateSchoolResponse:
    if get_settings().ROLE != "org_agent":
        raise HTTPException(400, "update only available in org_agent mode")
    req.school_slug = school_slug
    return await update_school_on_node(db, req)


@router.post("/schools/{school_slug}/suspend", response_model=AgentSchoolActionResponse, dependencies=[Depends(require_agent_token)])
async def suspend_school(
    school_slug: str,
    db: AsyncSession = Depends(get_db),
) -> AgentSchoolActionResponse:
    if get_settings().ROLE != "org_agent":
        raise HTTPException(400, "suspend only available in org_agent mode")
    return await suspend_school_on_node(db, school_slug)


@router.post("/schools/{school_slug}/unsuspend", response_model=AgentSchoolActionResponse, dependencies=[Depends(require_agent_token)])
async def unsuspend_school(
    school_slug: str,
    db: AsyncSession = Depends(get_db),
) -> AgentSchoolActionResponse:
    if get_settings().ROLE != "org_agent":
        raise HTTPException(400, "unsuspend only available in org_agent mode")
    return await unsuspend_school_on_node(db, school_slug)


@router.post("/schools/{school_slug}/deprovision", response_model=AgentSchoolActionResponse, dependencies=[Depends(require_agent_token)])
async def deprovision_school(
    school_slug: str,
    req: AgentDeprovisionSchoolRequest,
    db: AsyncSession = Depends(get_db),
) -> AgentSchoolActionResponse:
    if get_settings().ROLE != "org_agent":
        raise HTTPException(400, "deprovision only available in org_agent mode")
    req.school_slug = school_slug
    return await deprovision_school_on_node(db, req)


@router.post("/schools/{school_slug}/internal-rpc", response_model=AgentInternalRpcResponse, dependencies=[Depends(require_agent_token)])
async def internal_rpc(
    school_slug: str,
    req: AgentInternalRpcRequest,
    db: AsyncSession = Depends(get_db),
) -> AgentInternalRpcResponse:
    if get_settings().ROLE != "org_agent":
        raise HTTPException(400, "internal-rpc only available in org_agent mode")
    return await internal_rpc_on_node(db, school_slug, req)


@router.post("/landing/provision", response_model=AgentLandingResponse, dependencies=[Depends(require_agent_token)])
async def provision_landing(req: AgentLandingRequest, db: AsyncSession = Depends(get_db)) -> AgentLandingResponse:
    if get_settings().ROLE != "org_agent":
        raise HTTPException(400, "landing only available in org_agent mode")
    return await provision_landing_on_node(db, req)


@router.post("/landing/{org_slug}/deprovision", response_model=AgentLandingResponse, dependencies=[Depends(require_agent_token)])
async def deprovision_landing(org_slug: str, db: AsyncSession = Depends(get_db)) -> AgentLandingResponse:
    if get_settings().ROLE != "org_agent":
        raise HTTPException(400, "landing only available in org_agent mode")
    return await deprovision_landing_on_node(db, org_slug)


@router.post("/restart", response_model=AgentNodeActionResponse)
async def restart_node(db: AsyncSession = Depends(get_db)) -> AgentNodeActionResponse:
    if get_settings().ROLE != "org_agent":
        raise HTTPException(400, "restart only available in org_agent mode")
    return await restart_node_stack(db)


@router.post("/heartbeat", response_model=AgentHeartbeatResponse)
async def heartbeat(
    req: AgentHeartbeatRequest,
    db: AsyncSession = Depends(get_db),
) -> AgentHeartbeatResponse:
    if get_settings().ROLE != "org_agent":
        raise HTTPException(400, "heartbeat only available in org_agent mode")
    return await send_heartbeat(db, req)
