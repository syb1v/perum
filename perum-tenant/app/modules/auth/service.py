"""Auth business logic (kept out of the router per the module pattern)."""

from __future__ import annotations

from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, hash_password, verify_password
from app.models import User


async def authenticate(db: AsyncSession, login: str, password: str) -> str:
    result = await db.execute(select(User).where(User.login == login))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active or not verify_password(password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid login or password")
    user.last_login_at = datetime.utcnow()
    await db.commit()
    return create_access_token(
        subject=str(user.id),
        extra={"role": user.role, "school_id": user.school_id, "login": user.login},
    )


async def change_password(db: AsyncSession, user: User, old: str, new: str) -> None:
    if not verify_password(old, user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "old password is incorrect")
    user.password_hash = hash_password(new)
    user.must_change_password = False
    await db.commit()
