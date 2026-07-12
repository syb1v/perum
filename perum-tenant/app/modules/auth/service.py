"""Auth business logic (kept out of the router per the module pattern)."""

from __future__ import annotations

import secrets
import hashlib
from datetime import timedelta
from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, verify_password
from app.core.time import utc_now
from app.core.config import get_settings
from app.models import RefreshSession, User

settings = get_settings()


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _access_token(user: User, session: RefreshSession) -> str:
    return create_access_token(subject=str(user.id), session_backed=True, extra={
        "id": user.id, "role": user.role, "school_id": user.school_id, "login": user.login,
        "session_token": session.session_token, "token_version": session.token_version,
    })


async def authenticate(db: AsyncSession, login: str, password: str, metadata: dict | None = None) -> tuple[str, str]:
    result = await db.execute(select(User).where(User.login == login))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active or not verify_password(password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Неверный логин или пароль")

    now = utc_now()
    refresh_token = secrets.token_urlsafe(48)
    metadata = metadata or {}
    session = RefreshSession(
        user_id=user.id, session_token=secrets.token_urlsafe(32),
        refresh_token_hash=_hash_token(refresh_token), expires_at=now + timedelta(days=settings.REFRESH_TOKEN_TTL_DAYS),
        **metadata,
    )
    db.add(session)
    user.last_login_at = now
    await db.commit()
    return _access_token(user, session), refresh_token


async def rotate_refresh(db: AsyncSession, refresh_token: str) -> tuple[str, str]:
    token_hash = _hash_token(refresh_token)
    session = await db.scalar(select(RefreshSession).where(
        (RefreshSession.refresh_token_hash == token_hash) | (RefreshSession.previous_refresh_token_hash == token_hash)
    ).with_for_update())
    now = utc_now()
    if session is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid refresh token")
    if session.previous_refresh_token_hash == token_hash:
        session.revoked_at = now
        await db.commit()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "refresh token reuse detected")
    user = await db.get(User, session.user_id)
    if session.revoked_at or session.expires_at <= now or user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "refresh session expired or revoked")
    new_token = secrets.token_urlsafe(48)
    session.previous_refresh_token_hash = session.refresh_token_hash
    session.refresh_token_hash = _hash_token(new_token)
    session.token_version += 1
    session.last_used_at = now
    await db.commit()
    return _access_token(user, session), new_token


async def revoke_all(db: AsyncSession, user_id: int) -> None:
    await db.execute(update(RefreshSession).where(
        RefreshSession.user_id == user_id, RefreshSession.revoked_at.is_(None)
    ).values(revoked_at=utc_now()))


async def revoke_session(db: AsyncSession, user_id: int, session_token: str) -> bool:
    session = await db.scalar(select(RefreshSession).where(
        RefreshSession.user_id == user_id, RefreshSession.session_token == session_token
    ))
    if session and session.revoked_at is None:
        session.revoked_at = utc_now()
        return True
    return False


def user_public(user: User) -> dict:
    """Legacy-compatible user shape for GET /api/user/me."""
    return {
        "id": user.id,
        "login": user.login,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "role": user.role,
        "balance": user.balance,
        "avatar_url": user.avatar_url,
        "password_changed": not user.must_change_password,
        "school_id": user.school_id,
        "email": user.email,
    }
