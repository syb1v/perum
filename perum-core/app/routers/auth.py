"""Platform-admin authentication: login + whoami."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import require_platform_admin
from app.core.ratelimit import check_login_rate
from app.core.security import create_access_token, verify_password
from app.models import OrgAdmin, Organization, PlatformAdmin
from app.schemas.auth import LoginRequest, PlatformAdminRead, TokenResponse

router = APIRouter()


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    check_login_rate(request, payload.login)
    # 1) platform_admin (оператор платформы)
    result = await db.execute(select(PlatformAdmin).where(PlatformAdmin.login == payload.login))
    admin = result.scalar_one_or_none()
    if admin is not None and admin.is_active and verify_password(payload.password, admin.password_hash):
        admin.last_login_at = datetime.utcnow()
        await db.commit()
        token = create_access_token(subject=str(admin.id), extra={"login": admin.login, "role": "platform_admin"})
        return TokenResponse(access_token=token)

    # 2) org_admin (оператор узла орг — управляет школами своей орг)
    result = await db.execute(select(OrgAdmin).where(OrgAdmin.login == payload.login))
    org_admin = result.scalar_one_or_none()
    if org_admin is not None and org_admin.is_active and verify_password(payload.password, org_admin.password_hash):
        org = await db.get(Organization, org_admin.org_id)
        if org is not None and org.status == "suspended":
            raise HTTPException(status.HTTP_403_FORBIDDEN, "организация приостановлена")
        org_admin.last_login_at = datetime.utcnow()
        await db.commit()
        token = create_access_token(
            subject=str(org_admin.id),
            extra={"login": org_admin.login, "role": "org_admin", "org_id": org_admin.org_id},
        )
        return TokenResponse(access_token=token)

    raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid login or password")


@router.get("/me", response_model=PlatformAdminRead)
async def me(admin: PlatformAdmin = Depends(require_platform_admin)) -> PlatformAdmin:
    return admin
