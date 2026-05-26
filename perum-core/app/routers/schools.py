"""Школы организации — эндпоинты org_admin (архитектура v2, см. ARCH_ORG_NODE.md).

org_admin провижинит/останавливает школы СВОЕЙ орг (каждая — отдельный стек) и
получает одноразовую учётку администратора школы. Скоуп — строго `org_id` из токена.
Внутрь школьных данных ядро/org_admin не лезет — только метаданные стека.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from datetime import datetime

from app.core.config import get_settings
from app.core.db import get_db
from app.core.deps import require_org_admin
from app.models import OrgAdmin, Organization, Release, School, SchoolDomain, SchoolSecret
from app.services.billing import school_limit
from app.services.caddy_admin import get_caddy_admin
from app.services.stack_spec import school_container_name
from app.services.school_provisioner import (
    SchoolProvisionOutcome,
    current_release_image,
    deprovision_school,
    provision_school,
    update_school,
)
from app.services.tenant_provisioner import ProvisioningError

logger = logging.getLogger("perum.schools")

router = APIRouter()

BLOCKING = {"active", "provisioning"}


class SchoolCreate(BaseModel):
    slug: str
    name: str
    admin_email: str | None = None


class DomainCreate(BaseModel):
    domain: str


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
        # Лимит плана (биллинг-стаб): новая школа не должна превышать лимит орг.
        org = await db.get(Organization, admin.org_id)
        limit = school_limit(org.plan if org else "trial")
        used = int(await db.scalar(
            select(func.count(School.id)).where(School.org_id == admin.org_id, School.status != "archived")
        ) or 0)
        if used >= limit:
            raise HTTPException(
                status.HTTP_402_PAYMENT_REQUIRED,
                f"достигнут лимит школ для плана '{org.plan if org else 'trial'}' ({limit}). Повысьте план.",
            )
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


@router.get("/{school_id}/update-status")
async def update_status(school_id: int, admin: OrgAdmin = Depends(require_org_admin), db: AsyncSession = Depends(get_db)) -> dict:
    school = await _get_school(school_id, admin, db)
    settings = get_settings()
    latest = await current_release_image(db, settings)
    rel = (
        await db.execute(select(Release).where(Release.channel == "stable", Release.is_current.is_(True)).limit(1))
    ).scalar_one_or_none()
    return {
        "school_id": school.id,
        "current_tag": school.release_tag,
        "latest_image": latest,
        "latest_version": rel.version_tag if rel else None,
        "changelog": rel.changelog if rel else None,
        "update_available": bool(school.release_tag and school.release_tag != latest),
    }


@router.post("/{school_id}/update")
async def update_school_endpoint(school_id: int, admin: OrgAdmin = Depends(require_org_admin), db: AsyncSession = Depends(get_db)) -> dict:
    """Обновление школьного стека «по кнопке» на текущий релиз (volume-preserving)."""
    school = await _get_school(school_id, admin, db)
    try:
        outcome = await update_school(school, db)
    except ProvisioningError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"обновление школы '{school.slug}' не удалось: {exc}")
    return {
        "school": _school_dict(outcome.school),
        "from_image": outcome.from_image,
        "to_image": outcome.to_image,
        "rolled_back": outcome.rolled_back,
        "message": (
            "откат на прежнюю версию (обновление не удалось)" if outcome.rolled_back
            else ("уже на актуальной версии" if outcome.from_image == outcome.to_image else "обновлено")
        ),
    }


def _domain_dict(d: SchoolDomain) -> dict:
    return {"id": d.id, "domain": d.domain, "type": d.domain_type, "status": d.status}


@router.get("/{school_id}/domains")
async def list_domains(school_id: int, admin: OrgAdmin = Depends(require_org_admin), db: AsyncSession = Depends(get_db)) -> dict:
    school = await _get_school(school_id, admin, db)
    rows = (
        await db.execute(select(SchoolDomain).where(SchoolDomain.school_id == school.id).order_by(SchoolDomain.id))
    ).scalars().all()
    return {"domains": [_domain_dict(d) for d in rows]}


@router.post("/{school_id}/domains", status_code=status.HTTP_201_CREATED)
async def add_domain(
    school_id: int, payload: DomainCreate,
    admin: OrgAdmin = Depends(require_org_admin), db: AsyncSession = Depends(get_db),
) -> dict:
    """Привязать кастомный домен к школе: запись + Caddy-маршрут на стек школы.
    On-demand TLS затем выпустит сертификат (через /internal/validate-domain)."""
    school = await _get_school(school_id, admin, db)
    host = (payload.domain or "").strip().lower().split("/")[0]
    if not host or "." not in host or " " in host:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "некорректный домен")
    taken = (await db.execute(select(SchoolDomain).where(SchoolDomain.domain == host))).scalar_one_or_none()
    if taken is not None and taken.status != "removed":
        raise HTTPException(status.HTTP_409_CONFLICT, "домен уже занят")

    dom = SchoolDomain(school_id=school.id, domain=host, domain_type="custom", status="active", activated_at=datetime.utcnow())
    db.add(dom)
    await db.flush()
    upstream = f"{school_container_name(school.slug, 'app')}:3000"
    try:
        await get_caddy_admin().add_route(f"dom-{dom.id}", host, upstream)
    except Exception as exc:  # noqa: BLE001
        await db.rollback()
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"не удалось добавить маршрут для {host}: {exc}")
    await db.commit()
    return {"domain": _domain_dict(dom), "host": host, "message": "домен привязан; DNS → этот сервер, TLS выпустится автоматически"}


@router.delete("/{school_id}/domains/{domain_id}")
async def remove_domain(
    school_id: int, domain_id: int,
    admin: OrgAdmin = Depends(require_org_admin), db: AsyncSession = Depends(get_db),
) -> dict:
    school = await _get_school(school_id, admin, db)
    dom = await db.get(SchoolDomain, domain_id)
    if dom is None or dom.school_id != school.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "домен не найден")
    if dom.domain_type == "custom":
        try:
            await get_caddy_admin().remove_route(f"dom-{dom.id}")
        except Exception:  # noqa: BLE001
            pass
    await db.delete(dom)
    await db.commit()
    return {"id": domain_id, "removed": True}


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
