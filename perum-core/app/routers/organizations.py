"""Organization CRUD + lifecycle.

`POST /api/organizations` creates the control-DB record and then provisions the
org's docker stack (see app.services.tenant_provisioner). Provisioning is
synchronous for Phase 1: the request returns once the stack is healthy and
routed (status=active), or 502 if it failed (status=failed, resources cleaned).
"""

from __future__ import annotations

import hashlib
import logging
import secrets as secrets_mod
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import get_db
from app.core.security import hash_password
from app.models import EnrollmentToken, OrgAdmin, Organization, OrganizationSecret, School
from app.services.billing import PLANS, school_limit
from app.schemas.organization import (
    OrganizationCreate,
    OrganizationRead,
    OrgAdminCredentials,
    ProvisionResult,
)
from app.services.tenant_provisioner import (
    ProvisioningError,
    ProvisionOutcome,
    deprovision,
    provision,
)

logger = logging.getLogger("perum.organizations")

router = APIRouter()

# Statuses from which a fresh POST may reuse the existing row and (re)provision.
REPROVISIONABLE = {"failed", "archived"}
# Statuses that block a new POST for the same slug.
BLOCKING = {"active", "provisioning"}


def _to_result(outcome: ProvisionOutcome) -> ProvisionResult:
    admin = None
    if outcome.admin_login and outcome.admin_temp_password:
        admin = OrgAdminCredentials(
            login=outcome.admin_login, temporary_password=outcome.admin_temp_password
        )
    return ProvisionResult(
        organization=OrganizationRead.model_validate(outcome.org), org_admin=admin
    )


async def _get_org(slug: str, db: AsyncSession) -> Organization | None:
    result = await db.execute(select(Organization).where(Organization.slug == slug))
    return result.scalar_one_or_none()


@router.get("", response_model=list[OrganizationRead])
async def list_organizations(db: AsyncSession = Depends(get_db)) -> list[Organization]:
    result = await db.execute(select(Organization).order_by(Organization.created_at.desc()))
    return list(result.scalars().all())


@router.post("", response_model=ProvisionResult, status_code=status.HTTP_201_CREATED)
async def create_organization(
    payload: OrganizationCreate,
    db: AsyncSession = Depends(get_db),
) -> ProvisionResult:
    existing = await _get_org(payload.slug, db)
    if existing is not None and existing.status in BLOCKING:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"organization '{payload.slug}' already exists (status={existing.status})",
        )

    if existing is not None:
        # Reuse a failed/archived row: refresh mutable fields, then reprovision.
        org = existing
        org.name = payload.name
        org.admin_email = payload.admin_email
        org.plan = payload.plan
        org.deployment_mode = payload.deployment_mode
        org.notes = payload.notes
    else:
        org = Organization(
            slug=payload.slug,
            name=payload.name,
            admin_email=payload.admin_email,
            plan=payload.plan,
            deployment_mode=payload.deployment_mode,
            notes=payload.notes,
            status="provisioning",
        )
        db.add(org)
    await db.commit()
    await db.refresh(org)

    try:
        outcome = await provision(org, db)
    except ProvisioningError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"provisioning failed for '{org.slug}': {exc}",
        )
    return _to_result(outcome)


@router.get("/{slug}", response_model=OrganizationRead)
async def get_organization(slug: str, db: AsyncSession = Depends(get_db)) -> Organization:
    org = await _get_org(slug, db)
    if org is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="organization not found")
    return org


@router.post("/{slug}/reprovision", response_model=ProvisionResult)
async def reprovision_organization(
    slug: str, db: AsyncSession = Depends(get_db)
) -> ProvisionResult:
    org = await _get_org(slug, db)
    if org is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="organization not found")
    try:
        outcome = await provision(org, db)
    except ProvisioningError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"reprovisioning failed for '{org.slug}': {exc}",
        )
    return _to_result(outcome)


@router.delete("/{slug}")
async def delete_organization(
    slug: str,
    purge: bool = Query(False, description="Also delete the control-DB row + secrets"),
    db: AsyncSession = Depends(get_db),
) -> dict:
    org = await _get_org(slug, db)
    if org is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="organization not found")
    await deprovision(org, db)
    if purge:
        secret = await db.get(OrganizationSecret, org.id)
        if secret is not None:
            await db.delete(secret)
        await db.delete(org)
        await db.commit()
        return {"slug": slug, "purged": True}
    return {"slug": slug, "status": org.status}


# --- v2: платформа заводит администратора организации (оператора узла орг) ---

class OrgAdminCreate(BaseModel):
    login: str
    password: str
    full_name: str | None = None
    email: str | None = None


@router.post("/{slug}/org-admins", status_code=status.HTTP_201_CREATED)
async def create_org_admin(slug: str, payload: OrgAdminCreate, db: AsyncSession = Depends(get_db)) -> dict:
    org = await _get_org(slug, db)
    if org is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "organization not found")
    clash = await db.execute(select(OrgAdmin).where(OrgAdmin.login == payload.login))
    if clash.scalar_one_or_none() is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "org_admin with this login already exists")
    admin = OrgAdmin(
        org_id=org.id, login=payload.login, password_hash=hash_password(payload.password),
        full_name=payload.full_name, email=payload.email,
    )
    db.add(admin)
    await db.commit()
    await db.refresh(admin)
    return {"id": admin.id, "login": admin.login, "org_id": admin.org_id}


# --- v2: enrollment-токен для подключения узла организации ---

class EnrollmentTokenOut(BaseModel):
    token: str
    org_slug: str
    core_url: str
    expires_at: str


@router.post("/{slug}/enrollment-token", response_model=EnrollmentTokenOut)
async def issue_enrollment_token(slug: str, db: AsyncSession = Depends(get_db)) -> EnrollmentTokenOut:
    """Выдать одноразовый токен подключения узла орг. Плейнтекст — только в ответе;
    в БД хранится sha256-хеш. Узел орг предъявит токен на POST /api/enroll."""
    org = await _get_org(slug, db)
    if org is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "organization not found")
    raw = secrets_mod.token_urlsafe(32)
    expires = datetime.utcnow() + timedelta(days=7)
    db.add(EnrollmentToken(
        org_id=org.id, token_hash=hashlib.sha256(raw.encode()).hexdigest(), expires_at=expires,
    ))
    await db.commit()
    return EnrollmentTokenOut(
        token=raw, org_slug=org.slug,
        core_url=get_settings().CONTROL_PLANE_URL, expires_at=expires.isoformat(),
    )


# --- v2: биллинг-заглушки (план + лимит школ) ---

class PlanUpdate(BaseModel):
    plan: str


async def _active_school_count(db: AsyncSession, org_id: int) -> int:
    return int(await db.scalar(
        select(func.count(School.id)).where(School.org_id == org_id, School.status != "archived")
    ) or 0)


@router.get("/{slug}/billing")
async def get_billing(slug: str, db: AsyncSession = Depends(get_db)) -> dict:
    org = await _get_org(slug, db)
    if org is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "organization not found")
    used = await _active_school_count(db, org.id)
    limit = school_limit(org.plan)
    return {
        "org_slug": org.slug,
        "plan": org.plan,
        "school_limit": limit,
        "schools_used": used,
        "schools_remaining": max(limit - used, 0),
        "status": org.status,
        "created_at": org.created_at.isoformat() if org.created_at else None,
    }


@router.put("/{slug}/billing")
async def set_plan(slug: str, payload: PlanUpdate, db: AsyncSession = Depends(get_db)) -> dict:
    if payload.plan not in PLANS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"неизвестный план; допустимо: {', '.join(PLANS)}")
    org = await _get_org(slug, db)
    if org is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "organization not found")
    org.plan = payload.plan
    await db.commit()
    return {"org_slug": org.slug, "plan": org.plan, "school_limit": school_limit(org.plan)}
