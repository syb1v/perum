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
from app.core.roles import DIRECTOR, ORG_ADMIN, PARENT, SCHOOL_ADMIN, STUDENT, TEACHER
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


# In-school administration (one school). org_admin is NOT here — он работает
# уровнем выше (управляет школами и их админами), внутрь школы не заходит.
require_admin = require_roles(SCHOOL_ADMIN, DIRECTOR)

# Org-level only: управляет школами орг и их администраторами (как perum-core
# управляет организациями). Не имеет доступа к внутришкольным данным.
require_org_admin = require_roles(ORG_ADMIN)

# Teacher + in-school admins (journal/grades). Per-subject/class assignment is
# checked in the journal service.
require_teacher = require_roles(TEACHER, SCHOOL_ADMIN, DIRECTOR)

# Student cabinet (own diary/grades only — service scopes every query to user.id).
require_student = require_roles(STUDENT)

# Parent cabinet (own children only).
require_parent = require_roles(PARENT)
