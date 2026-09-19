"""CI-публикация релизов: GitHub Actions при РЕАЛЬНОМ изменении кода тенанта
вызывает этот эндпоинт и регистрирует релиз в ядре автоматически. Аутентификация —
по bearer-токену RELEASE_PUBLISH_TOKEN (отдельный секрет, не platform_admin).
Если токен не задан в ядре — эндпоинт выключен (503). См. docs/RELEASING.md."""

from __future__ import annotations

import secrets as secrets_mod
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import get_db
from app.models import Node, NodeTransportTransition
from app.routers.releases import CIReleaseCreate, _release_dict, publish_release_record
from app.services.node_bootstrap import _render_caddyfile, _render_compose, _validate_app_image
from app.services.remote_node_client import RemoteNodeClient
from app.services.web_rollout import rollout_web_to_active_organization_nodes

router = APIRouter()


class CIWebRolloutRequest(BaseModel):
    image: str = Field(
        pattern=r"^ghcr\.io/[a-z0-9][a-z0-9._-]*/perum-web@sha256:[0-9a-f]{64}$"
    )


class CIWebRolloutResponse(BaseModel):
    success: bool
    image: str
    nodes_total: int
    nodes_succeeded: int
    nodes_failed: int
    nodes_pending: int = 0
    receipts: list[dict[str, Any]]


class CINodeTransportConfigRequest(BaseModel):
    node_id: int = Field(gt=0)
    agent_image: str


class CINodeTransportMarkRequest(BaseModel):
    transition_id: str
    node_id: int = Field(gt=0)
    agent_image: str
    transport: str = Field(pattern=r"^https_v1$")
    expected_transport: str = Field(pattern=r"^(legacy_http|https_v1)$")
    expected_transport_version: str | None = None
    expected_web_rollout_version: str | None = None


class CINodeTransportTransitionResponse(BaseModel):
    transition_id: str
    node_id: int
    phase: str = Field(pattern=r"^(pending|committed|rejected)$")
    committed: bool
    error_code: str | None = None
    error_reason: str | None = None
    agent_transport: str | None = None
    agent_transport_version: str | None = None
    web_rollout_version: str | None = None


def _future_utc_deadline(name: str, value: str) -> datetime:
    if not value.endswith("Z"):
        raise HTTPException(status.HTTP_409_CONFLICT, f"{name} must be a future UTC timestamp ending in Z")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, f"{name} must be a valid future UTC timestamp") from exc
    if parsed <= datetime.now(timezone.utc):
        raise HTTPException(status.HTTP_409_CONFLICT, f"{name} must be in the future")
    return parsed


def _transition_dict(receipt: NodeTransportTransition) -> dict:
    return {
        "transition_id": receipt.transition_id,
        "node_id": receipt.node_id,
        "phase": receipt.phase,
        "committed": receipt.phase == "committed",
        "error_code": receipt.error_code,
        "error_reason": receipt.error_reason,
        "agent_transport": receipt.resulting_transport,
        "agent_transport_version": receipt.resulting_transport_version,
        "web_rollout_version": receipt.resulting_web_rollout_version,
    }


async def _require_release_token(authorization: str | None = Header(default=None)) -> None:
    settings = get_settings()
    if not settings.RELEASE_PUBLISH_TOKEN:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "CI-публикация релизов выключена (нет RELEASE_PUBLISH_TOKEN)")
    token = ""
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:]
    if not secrets_mod.compare_digest(token, settings.RELEASE_PUBLISH_TOKEN):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid release token")


@router.post("/release", status_code=status.HTTP_201_CREATED, dependencies=[Depends(_require_release_token)])
async def ci_publish_release(payload: CIReleaseCreate, db: AsyncSession = Depends(get_db)) -> dict:
    rel = await publish_release_record(payload, db)
    return _release_dict(rel)


@router.post("/web/rollout", response_model=CIWebRolloutResponse, dependencies=[Depends(_require_release_token)])
async def ci_rollout_web(payload: CIWebRolloutRequest, db: AsyncSession = Depends(get_db)) -> dict:
    desired = get_settings().WEB_IMAGE
    if payload.image != desired:
        raise HTTPException(status.HTTP_409_CONFLICT, "image does not match configured Web release")
    return await rollout_web_to_active_organization_nodes(payload.image, db)


@router.get("/deployment/preflight", dependencies=[Depends(_require_release_token)])
async def ci_deployment_preflight(db: AsyncSession = Depends(get_db)) -> dict:
    legacy_nodes = await db.scalar(
        select(func.count()).select_from(Node).where(
            or_(Node.agent_transport == "legacy_http", Node.web_rollout_version.is_(None))
        )
    )
    settings = get_settings()
    if legacy_nodes:
        _future_utc_deadline("AGENT_LEGACY_HTTP_DEADLINE", settings.AGENT_LEGACY_HTTP_DEADLINE)
        _future_utc_deadline("WEB_ROLLOUT_LEGACY_DEADLINE", settings.WEB_ROLLOUT_LEGACY_DEADLINE)
    return {"ready": True, "legacy_nodes": legacy_nodes}


@router.post("/node-transport/config", dependencies=[Depends(_require_release_token)])
async def ci_node_transport_config(
    payload: CINodeTransportConfigRequest, db: AsyncSession = Depends(get_db)
) -> dict:
    node = await db.get(Node, payload.node_id)
    if node is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "node not found")
    image = _validate_app_image("AGENT_IMAGE", payload.agent_image)
    settings = get_settings()
    return {
        "node_id": node.id,
        "hostname": node.hostname,
        "ssh_port": node.ssh_port,
        "agent_port": settings.AGENT_PORT,
        "legacy_http_port": settings.AGENT_LEGACY_HTTP_PORT,
        "mtls_required": settings.AGENT_MTLS_REQUIRED,
        "agent_image": image,
        "agent_transport": node.agent_transport,
        "agent_transport_version": node.agent_transport_version,
        "web_rollout_version": node.web_rollout_version,
        "docker_compose": _render_compose(settings, image),
        "caddyfile": _render_caddyfile(settings),
    }


@router.get(
    "/node-transport/transitions/{transition_id}",
    response_model=CINodeTransportTransitionResponse,
    dependencies=[Depends(_require_release_token)],
)
async def ci_node_transport_transition_status(
    transition_id: str, db: AsyncSession = Depends(get_db)
) -> dict:
    try:
        normalized = str(UUID(transition_id))
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "invalid transition_id") from exc
    receipt = await db.get(NodeTransportTransition, normalized)
    if receipt is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "transition not found")
    return _transition_dict(receipt)


@router.post(
    "/node-transport/mark",
    response_model=CINodeTransportTransitionResponse,
    dependencies=[Depends(_require_release_token)],
)
async def ci_mark_node_transport(
    payload: CINodeTransportMarkRequest, db: AsyncSession = Depends(get_db)
) -> dict:
    try:
        transition_id = str(UUID(payload.transition_id))
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "invalid transition_id") from exc
    node = await db.scalar(select(Node).where(Node.id == payload.node_id).with_for_update())
    if node is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "node not found")
    existing = await db.get(NodeTransportTransition, transition_id)
    if existing is not None:
        identity = (
            existing.node_id,
            existing.agent_image,
            existing.expected_transport,
            existing.expected_transport_version,
            existing.expected_web_rollout_version,
        )
        requested_identity = (
            payload.node_id,
            payload.agent_image,
            payload.expected_transport,
            payload.expected_transport_version,
            payload.expected_web_rollout_version,
        )
        if identity != requested_identity:
            raise HTTPException(status.HTTP_409_CONFLICT, "transition_id belongs to another operation")
        if existing.phase in {"committed", "rejected"}:
            return _transition_dict(existing)
    _validate_app_image("AGENT_IMAGE", payload.agent_image)
    expected = (
        payload.expected_transport,
        payload.expected_transport_version,
        payload.expected_web_rollout_version,
    )
    actual = (node.agent_transport, node.agent_transport_version, node.web_rollout_version)
    if existing is None:
        existing = NodeTransportTransition(
            transition_id=transition_id,
            node_id=node.id,
            expected_transport=payload.expected_transport,
            expected_transport_version=payload.expected_transport_version,
            expected_web_rollout_version=payload.expected_web_rollout_version,
            agent_image=payload.agent_image,
            phase="pending",
        )
        db.add(existing)
        try:
            await db.flush()
        except IntegrityError:
            await db.rollback()
            existing = await db.get(NodeTransportTransition, transition_id)
            if existing is None:
                raise HTTPException(status.HTTP_409_CONFLICT, "transition_id is already in use")
            identity = (
                existing.node_id,
                existing.agent_image,
                existing.expected_transport,
                existing.expected_transport_version,
                existing.expected_web_rollout_version,
            )
            requested_identity = (
                payload.node_id,
                payload.agent_image,
                payload.expected_transport,
                payload.expected_transport_version,
                payload.expected_web_rollout_version,
            )
            if identity != requested_identity:
                raise HTTPException(status.HTTP_409_CONFLICT, "transition_id belongs to another operation")
            return _transition_dict(existing)
    if actual != expected:
        existing.phase = "rejected"
        existing.error_code = "expected_state_mismatch"
        existing.error_reason = "Node state does not match the expected previous state"
        await db.commit()
        return _transition_dict(existing)
    original_transport = node.agent_transport
    node.agent_transport = "https_v1"
    client = RemoteNodeClient(timeout=15.0)
    proof_error = False
    try:
        try:
            whoami = await client._request(node, "GET", "/whoami")
            health = await client._request(node, "GET", "/health")
            capabilities = await client._request(node, "GET", "/capabilities")
        except Exception:
            proof_error = True
    finally:
        node.agent_transport = original_transport
    if proof_error:
        error_code, error_reason = "candidate_unavailable", "Candidate HTTPS proof was unavailable"
    elif whoami.get("role") != "org_agent" or not isinstance(health, dict):
        error_code, error_reason = "candidate_identity_invalid", "Candidate HTTPS identity or health proof failed"
    elif capabilities.get("agent_image") != payload.agent_image:
        error_code, error_reason = "candidate_image_mismatch", "Candidate HTTPS image proof did not match"
    elif "web_rollout_v1" not in capabilities.get("capabilities", []):
        error_code, error_reason = "candidate_capability_missing", "Candidate HTTPS capability proof failed"
    else:
        error_code = error_reason = None
    if error_code:
        existing.phase = "rejected"
        existing.error_code = error_code
        existing.error_reason = error_reason
        await db.commit()
        return _transition_dict(existing)
    node.agent_transport = payload.transport
    node.agent_transport_version = payload.agent_image
    node.web_rollout_version = "web_rollout_v1"
    existing.phase = "committed"
    existing.resulting_transport = node.agent_transport
    existing.resulting_transport_version = node.agent_transport_version
    existing.resulting_web_rollout_version = node.web_rollout_version
    existing.committed_at = datetime.now(timezone.utc).replace(tzinfo=None)
    await db.commit()
    return _transition_dict(existing)
