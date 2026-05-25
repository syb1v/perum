"""Школы организации — эндпоинты org_admin (архитектура v2, см. ARCH_ORG_NODE.md).

org_admin провижинит/останавливает школы СВОЕЙ орг (каждая — отдельный стек) и
получает одноразовую учётку администратора школы. Скоуп — строго `org_id` из токена.
Внутрь школьных данных ядро/org_admin не лезет — только метаданные стека.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.core.db import get_db
from app.core.deps import require_org_admin
from app.models import OrgAdmin, School, SchoolSecret
from app.services.school_provisioner import (
    SchoolProvisionOutcome,
    deprovision_school,
    provision_school,
)
from app.services.tenant_provisioner import ProvisioningError

logger = logging.getLogger("perum.schools")

router = APIRouter()

BLOCKING = {"active", "provisioning"}


class SchoolCreate(BaseModel):
    slug: str
    name: str
    admin_email: str | None = None


def _school_dict(s: School) -> dict:
    return {
        "id": s.id,
        "org_id": s.org_id,
        "slug": s.slug,
        "name": s.name,
        "status": s.status,
        "release_tag": s.release_tag,
        "created_at": s.created_at.isoformat() if s.created_at else None,
        "activated_at": s.activated_at.isoformat() if s.activated_at else None,
    }


def _result(outcome: SchoolProvisionOutcome) -> dict:
    out = {"school": _school_dict(outcome.school), "host": outcome.host}
    if outcome.admin_login and outcome.admin_temp_password:
        out["school_admin"] = {
            "login": outcome.admin_login,
            "temporary_password": outcome.admin_temp_password,
        }
    return out


async def _get_school(school_id: int, admin: OrgAdmin, db: AsyncSession) -> School:
    s = await db.get(School, school_id)
    if s is None or s.org_id != admin.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "школа не найдена")
    return s


@router.get("")
async def list_schools(admin: OrgAdmin = Depends(require_org_admin), db: AsyncSession = Depends(get_db)) -> dict:
    rows = (
        await db.execute(select(School).where(School.org_id == admin.org_id).order_by(School.id))
    ).scalars().all()
    return {"schools": [_school_dict(s) for s in rows]}


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_school(
    payload: SchoolCreate,
    admin: OrgAdmin = Depends(require_org_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    existing = (await db.execute(select(School).where(School.slug == payload.slug))).scalar_one_or_none()
    if existing is not None and existing.status in BLOCKING:
        raise HTTPException(status.HTTP_409_CONFLICT, f"школа '{payload.slug}' уже существует (status={existing.status})")

    if existing is not None and existing.org_id == admin.org_id:
        school = existing
        school.name = payload.name
        school.admin_email = payload.admin_email
    elif existing is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, f"slug '{payload.slug}' занят другой организацией")
    else:
        school = School(
            org_id=admin.org_id, slug=payload.slug, name=payload.name,
            admin_email=payload.admin_email, status="provisioning",
        )
        db.add(school)
    await db.commit()
    await db.refresh(school)

    try:
        outcome = await provision_school(school, db)
    except ProvisioningError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"провижининг школы '{school.slug}' не удался: {exc}")
    return _result(outcome)


@router.get("/{school_id}")
async def get_school(school_id: int, admin: OrgAdmin = Depends(require_org_admin), db: AsyncSession = Depends(get_db)) -> dict:
    return _school_dict(await _get_school(school_id, admin, db))


@router.post("/{school_id}/reprovision")
async def reprovision_school(school_id: int, admin: OrgAdmin = Depends(require_org_admin), db: AsyncSession = Depends(get_db)) -> dict:
    school = await _get_school(school_id, admin, db)
    try:
        outcome = await provision_school(school, db)
    except ProvisioningError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"reprovision школы '{school.slug}' не удался: {exc}")
    return _result(outcome)


@router.delete("/{school_id}")
async def delete_school(
    school_id: int,
    purge: bool = Query(False, description="Также удалить запись школы + секреты"),
    admin: OrgAdmin = Depends(require_org_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    school = await _get_school(school_id, admin, db)
    await deprovision_school(school, db)
    if purge:
        secret = await db.get(SchoolSecret, school.id)
        if secret is not None:
            await db.delete(secret)
        await db.delete(school)
        await db.commit()
        return {"id": school_id, "purged": True}
    return {"id": school_id, "status": school.status}
