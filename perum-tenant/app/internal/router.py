"""Control-plane → tenant RPC. Authenticated by the shared TELEMETRY_TOKEN that
the control plane generated for this org and injected into the stack env.

Phase 2: bootstrap the first org_admin (PROVISIONING step 9). Telemetry/heartbeat
endpoints land here later (Phase 9).
"""

from __future__ import annotations

import secrets

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import get_db
from app.core.roles import ORG_ADMIN
from app.core.security import hash_password
from app.models import User

settings = get_settings()
router = APIRouter()


class BootstrapAdminRequest(BaseModel):
    email: EmailStr
    full_name: str | None = None


async def _require_telemetry_token(x_telemetry_token: str | None = Header(default=None)) -> None:
    if not settings.TELEMETRY_TOKEN or x_telemetry_token != settings.TELEMETRY_TOKEN:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid telemetry token")


@router.post("/bootstrap-org-admin", dependencies=[Depends(_require_telemetry_token)])
async def bootstrap_org_admin(
    payload: BootstrapAdminRequest, db: AsyncSession = Depends(get_db)
) -> dict:
    existing = await db.execute(select(User).where(User.role == ORG_ADMIN).limit(1))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "org_admin already exists")

    temp_password = secrets.token_urlsafe(9)
    user = User(
        school_id=None,
        role=ORG_ADMIN,
        login=payload.email,
        email=payload.email,
        full_name=payload.full_name,
        password_hash=hash_password(temp_password),
        must_change_password=True,
    )
    db.add(user)
    await db.commit()
    return {
        "login": user.login,
        "temporary_password": temp_password,
        "must_change_password": True,
    }
