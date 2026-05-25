"""Control-plane → tenant RPC. Authenticated by the shared TELEMETRY_TOKEN that
the control plane generated for this stack and injected into the env.

Архитектура v2 (см. docs/ARCH_ORG_NODE.md): тенант-стек = ОДНА школа. При
провижининге узел орг бутстрапит первого `school_admin` этой школы.
"""

from __future__ import annotations

import secrets

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import get_db
from app.core.roles import SCHOOL_ADMIN
from app.core.security import hash_password
from app.models import School, User

settings = get_settings()
router = APIRouter()


class BootstrapAdminRequest(BaseModel):
    email: EmailStr
    full_name: str | None = None


async def _require_telemetry_token(x_telemetry_token: str | None = Header(default=None)) -> None:
    if not settings.TELEMETRY_TOKEN or x_telemetry_token != settings.TELEMETRY_TOKEN:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid telemetry token")


async def _do_bootstrap(payload: BootstrapAdminRequest, db: AsyncSession) -> dict:
    # Один стек = одна школа. Берём её (создаётся seed_defaults до bootstrap).
    school_id = await db.scalar(select(School.id).order_by(School.id).limit(1))

    existing = await db.execute(select(User).where(User.role == SCHOOL_ADMIN).limit(1))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "school_admin already exists")

    temp_password = secrets.token_urlsafe(9)
    user = User(
        school_id=school_id,
        role=SCHOOL_ADMIN,
        login=payload.email,
        email=payload.email,
        first_name=payload.full_name or "Администратор",
        last_name="школы",
        password_hash=hash_password(temp_password),
        must_change_password=True,
    )
    db.add(user)
    await db.commit()
    return {"login": user.login, "temporary_password": temp_password, "must_change_password": True}


@router.post("/bootstrap-school-admin", dependencies=[Depends(_require_telemetry_token)])
async def bootstrap_school_admin(
    payload: BootstrapAdminRequest, db: AsyncSession = Depends(get_db)
) -> dict:
    return await _do_bootstrap(payload, db)


# Совместимость со старым путём (легаси-провижинер орг). Тоже создаёт school_admin.
@router.post("/bootstrap-org-admin", dependencies=[Depends(_require_telemetry_token)])
async def bootstrap_org_admin_compat(
    payload: BootstrapAdminRequest, db: AsyncSession = Depends(get_db)
) -> dict:
    return await _do_bootstrap(payload, db)
