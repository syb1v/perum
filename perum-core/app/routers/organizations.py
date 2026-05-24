"""Stub CRUD for organizations.

For Phase 1 this only persists records — the actual docker provisioning
(stack render, compose up, alembic upgrade, caddy route) lands in the next
session, in `app/services/tenant_provisioner.py`.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.models import Organization
from app.schemas.organization import OrganizationCreate, OrganizationRead

router = APIRouter()


@router.get("", response_model=list[OrganizationRead])
async def list_organizations(db: AsyncSession = Depends(get_db)) -> list[Organization]:
    result = await db.execute(select(Organization).order_by(Organization.created_at.desc()))
    return list(result.scalars().all())


@router.post("", response_model=OrganizationRead, status_code=status.HTTP_201_CREATED)
async def create_organization(
    payload: OrganizationCreate,
    db: AsyncSession = Depends(get_db),
) -> Organization:
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
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"organization with slug '{payload.slug}' already exists",
        )
    await db.refresh(org)
    return org


@router.get("/{slug}", response_model=OrganizationRead)
async def get_organization(slug: str, db: AsyncSession = Depends(get_db)) -> Organization:
    result = await db.execute(select(Organization).where(Organization.slug == slug))
    org = result.scalar_one_or_none()
    if org is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="organization not found")
    return org
