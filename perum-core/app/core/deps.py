"""Shared FastAPI dependencies for the control plane."""

from __future__ import annotations

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.security import decode_access_token
from app.models import OrgAdmin, PlatformAdmin

_bearer = HTTPBearer(auto_error=False)
_UNAUTH = {"WWW-Authenticate": "Bearer"}


async def require_platform_admin(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
) -> PlatformAdmin:
    if credentials is None or not credentials.credentials:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "missing bearer token", _UNAUTH)
    try:
        payload = decode_access_token(credentials.credentials)
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid or expired token", _UNAUTH)
    if payload.get("role") != "platform_admin":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "not a platform admin token", _UNAUTH)
    sub = payload.get("sub")
    admin = await db.get(PlatformAdmin, int(sub)) if sub is not None else None
    if admin is None or not admin.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "admin not found or inactive", _UNAUTH)
    return admin


async def require_org_admin(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
) -> OrgAdmin:
    """Оператор узла орг. Токен несёт role=org_admin и org_id (скоуп). Управляет
    только школами своей орг — внутрь школ не заходит."""
    if credentials is None or not credentials.credentials:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "missing bearer token", _UNAUTH)
    try:
        payload = decode_access_token(credentials.credentials)
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid or expired token", _UNAUTH)
    if payload.get("role") != "org_admin":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "not an org admin token", _UNAUTH)
    sub = payload.get("sub")
    org_admin = await db.get(OrgAdmin, int(sub)) if sub is not None else None
    if org_admin is None or not org_admin.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "org admin not found or inactive", _UNAUTH)
    return org_admin
