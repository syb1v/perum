"""Organization CRUD + lifecycle.

`POST /api/organizations` creates the control-DB record and then provisions the
org's docker stack (see app.services.tenant_provisioner). Provisioning is
synchronous for Phase 1: the request returns once the stack is healthy and
routed (status=active), or 502 if it failed (status=failed, resources cleaned).
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.models import Organization, OrganizationSecret
from app.schemas.organization import OrganizationCreate, OrganizationRead
from app.services.tenant_provisioner import ProvisioningError, deprovision, provision

logger = logging.getLogger("perum.organizations")

router = APIRouter()

# Statuses from which a fresh POST may reuse the existing row and (re)provision.
REPROVISIONABLE = {"failed", "archived"}
# Statuses that block a new POST for the same slug.
BLOCKING = {"active", "provisioning"}


async def _get_org(slug: str, db: AsyncSession) -> Organization | None:
    result = await db.execute(select(Organization).where(Organization.slug == slug))
    return result.scalar_one_or_none()


@router.get("", response_model=list[OrganizationRead])
async def list_organizations(db: AsyncSession = Depends(get_db)) -> list[Organization]:
    result = await db.execute(select(Organization).order_by(Organization.created_at.desc()))
    return list(result.scalars().all())


@router.post("", response_model=OrganizationRead, status_code=status.HTTP_201_CREATED)
async def create_organization(
    payload: OrganizationCreate,
    db: AsyncSession = Depends(get_db),
) -> Organization:
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
        await provision(org, db)
    except ProvisioningError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"provisioning failed for '{org.slug}': {exc}",
        )
    return org


@router.get("/{slug}", response_model=OrganizationRead)
async def get_organization(slug: str, db: AsyncSession = Depends(get_db)) -> Organization:
    org = await _get_org(slug, db)
    if org is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="organization not found")
    return org


@router.post("/{slug}/reprovision", response_model=OrganizationRead)
async def reprovision_organization(
    slug: str, db: AsyncSession = Depends(get_db)
) -> Organization:
    org = await _get_org(slug, db)
    if org is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="organization not found")
    try:
        await provision(org, db)
    except ProvisioningError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"reprovisioning failed for '{org.slug}': {exc}",
        )
    return org


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
