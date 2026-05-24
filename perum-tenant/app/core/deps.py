"""Tenant request dependencies: current user + role gates.

The headline isolation invariant lives here: a token whose `org_slug` claim does
not match this stack's ORG_SLUG is rejected with 401. Combined with one DB per
org, that makes cross-org access impossible even if a token leaks.
"""

from __future__ import annotations

from collections.abc import Callable

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import get_db
from app.core.security import decode_access_token
from app.models import User

settings = get_settings()

_bearer = HTTPBearer(auto_error=False)
_UNAUTH = {"WWW-Authenticate": "Bearer"}


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
) -> User:
    if credentials is None or not credentials.credentials:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "missing bearer token", _UNAUTH)
    try:
        payload = decode_access_token(credentials.credentials)
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid or expired token", _UNAUTH)

    # Cross-org guard: token must have been issued by THIS org's stack.
    if payload.get("org_slug") != settings.ORG_SLUG:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, "token issued for another organization", _UNAUTH
        )

    sub = payload.get("sub")
    user = await db.get(User, int(sub)) if sub is not None else None
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "user not found or inactive", _UNAUTH)
    return user


def require_roles(*roles: str) -> Callable:
    async def _dep(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "insufficient role")
        return user

    return _dep
