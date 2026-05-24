"""Platform-admin authentication: login + whoami."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import require_platform_admin
from app.core.security import create_access_token, verify_password
from app.models import PlatformAdmin
from app.schemas.auth import LoginRequest, PlatformAdminRead, TokenResponse

router = APIRouter()


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    result = await db.execute(select(PlatformAdmin).where(PlatformAdmin.login == payload.login))
    admin = result.scalar_one_or_none()
    if admin is None or not admin.is_active or not verify_password(payload.password, admin.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid login or password")
    admin.last_login_at = datetime.utcnow()
    await db.commit()
    token = create_access_token(
        subject=str(admin.id),
        extra={"login": admin.login, "role": "platform_admin"},
    )
    return TokenResponse(access_token=token)


@router.get("/me", response_model=PlatformAdminRead)
async def me(admin: PlatformAdmin = Depends(require_platform_admin)) -> PlatformAdmin:
    return admin
