"""Tenant auth — legacy-compatible contract consumed by the school frontend.

Mounted at /api:  POST /api/login · GET /api/user/me · POST /api/logout
"""

from __future__ import annotations

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import get_current_user
from app.core.ratelimit import check_login_rate
from app.core.security import decode_access_token
from app.models import RefreshSession, User
from app.modules.auth import service
from app.modules.auth.schemas import LoginRequest, LoginResponse, RefreshRequest, SessionRead, UserRead
from app.modules.mobile_descriptor import (
    LegacyCapabilities,
    LegacyCompatibility,
    MobileDescriptor,
    legacy_capabilities,
    legacy_compatibility,
    resolve_descriptor,
)

router = APIRouter()
bearer = HTTPBearer(auto_error=False)


@router.post("/login", response_model=LoginResponse)
async def login(payload: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)) -> LoginResponse:
    check_login_rate(request, payload.login)
    metadata = {
        "device_id": payload.device_id, "device_name": payload.device_name,
        "device_platform": payload.device_platform, "app_version": payload.app_version,
        "last_ip": request.client.host if request.client else None,
        "user_agent": request.headers.get("user-agent"),
    }
    token, refresh_token = await service.authenticate(db, payload.login, payload.password, metadata)
    return LoginResponse(token=token, access_token=token, refresh_token=refresh_token,
                         token_type="bearer", expires_in=service.settings.ACCESS_TOKEN_TTL_MINUTES * 60)


@router.post("/auth/refresh", response_model=LoginResponse)
async def refresh(payload: RefreshRequest, db: AsyncSession = Depends(get_db)) -> LoginResponse:
    token, refresh_token = await service.rotate_refresh(db, payload.refresh_token)
    return LoginResponse(token=token, access_token=token, refresh_token=refresh_token,
                         token_type="bearer", expires_in=service.settings.ACCESS_TOKEN_TTL_MINUTES * 60)


def _session_token(credentials: HTTPAuthorizationCredentials | None) -> str | None:
    if credentials is None:
        return None
    try:
        return decode_access_token(credentials.credentials).get("session_token")
    except jwt.PyJWTError:
        return None


@router.get("/auth/sessions", response_model=list[SessionRead])
@router.get("/auth/devices", response_model=list[SessionRead])
async def sessions(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
                   credentials: HTTPAuthorizationCredentials | None = Depends(bearer)) -> list[dict]:
    current = _session_token(credentials)
    rows = (await db.execute(select(RefreshSession).where(
        RefreshSession.user_id == user.id, RefreshSession.revoked_at.is_(None)
    ).order_by(RefreshSession.last_used_at.desc()))).scalars().all()
    return [{"session_token": row.session_token, "device_id": row.device_id, "device_name": row.device_name,
             "device_platform": row.device_platform, "app_version": row.app_version,
             "created_at": row.created_at, "last_used_at": row.last_used_at,
             "current": row.session_token == current} for row in rows]


@router.delete("/auth/sessions/{session_token}")
async def delete_session(session_token: str, user: User = Depends(get_current_user),
                         db: AsyncSession = Depends(get_db)) -> dict:
    if not await service.revoke_session(db, user.id, session_token):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "session not found")
    await db.commit()
    return {"success": True}


@router.post("/auth/logout-all")
async def logout_all(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> dict:
    await service.revoke_all(db, user.id)
    await db.commit()
    return {"success": True}


@router.get("/user/me", response_model=UserRead)
async def user_me(user: User = Depends(get_current_user)) -> dict:
    return service.user_public(user)


@router.post("/logout")
async def logout(credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
                 db: AsyncSession = Depends(get_db)) -> dict:
    if credentials:
        try:
            payload = decode_access_token(credentials.credentials)
            if payload.get("sub") and payload.get("session_token"):
                await service.revoke_session(db, int(payload["sub"]), payload["session_token"])
                await db.commit()
        except (jwt.PyJWTError, ValueError):
            pass
    return {"success": True}


@router.get("/mobile/descriptor", response_model=MobileDescriptor)
async def mobile_descriptor() -> MobileDescriptor:
    return resolve_descriptor()[0]


@router.get("/mobile/compatibility", response_model=LegacyCompatibility)
async def mobile_compatibility() -> LegacyCompatibility:
    descriptor, _ = resolve_descriptor()
    return legacy_compatibility(descriptor)


@router.get("/mobile/capabilities", response_model=LegacyCapabilities)
async def mobile_capabilities() -> LegacyCapabilities:
    descriptor, push = resolve_descriptor()
    return legacy_capabilities(descriptor, push)
