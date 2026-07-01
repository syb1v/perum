"""Auth business logic (kept out of the router per the module pattern)."""

from __future__ import annotations

import secrets
from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, verify_password
from app.models import User


async def authenticate(db: AsyncSession, login: str, password: str) -> str:
    result = await db.execute(select(User).where(User.login == login))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active or not verify_password(password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Неверный логин или пароль")

    user.last_login_at = datetime.utcnow()
    await db.commit()

    # `id`, `role`, `session_token` are read by the web middleware (from the
    # cookie) for UX role-routing. `session_token` is currently just a presence
    # claim — real server-side session revocation is a later item (TODO).
    return create_access_token(
        subject=str(user.id),
        extra={
            "id": user.id,
            "role": user.role,
            "school_id": user.school_id,
            "login": user.login,
            "session_token": secrets.token_urlsafe(16),
        },
    )


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
