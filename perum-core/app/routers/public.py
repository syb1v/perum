import ipaddress
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.models import Organization, School, SchoolDomain
from app.schemas.public import (
    TenantCapabilities,
    TenantCompatibility,
    TenantDiscoveryRequest,
    TenantDiscoveryResponse,
)

router = APIRouter()

_NOT_FOUND = "Tenant not found"


def normalize_tenant_host(value: str) -> str:
    candidate = value.strip()
    if not candidate:
        raise ValueError

    parsed = urlsplit(candidate if "://" in candidate else f"//{candidate}")
    if parsed.scheme and parsed.scheme.lower() not in {"http", "https"}:
        raise ValueError
    if parsed.username is not None or parsed.password is not None:
        raise ValueError
    try:
        host = parsed.hostname
        parsed.port
    except ValueError as exc:
        raise ValueError from exc
    if not host:
        raise ValueError

    host = host.rstrip(".").lower()
    try:
        ipaddress.ip_address(host)
    except ValueError:
        pass
    else:
        raise ValueError

    try:
        host = host.encode("idna").decode("ascii")
    except UnicodeError as exc:
        raise ValueError from exc
    if len(host) > 253:
        raise ValueError
    labels = host.split(".")
    if len(labels) < 2 or any(
        not label or len(label) > 63 or label.startswith("-") or label.endswith("-")
        or not all(char.isalnum() or char == "-" for char in label)
        for label in labels
    ):
        raise ValueError
    return host


def _response(
    school: School,
    organization: Organization,
    primary_host: str,
    matched_host: str,
) -> TenantDiscoveryResponse:
    web_base_url = f"https://{primary_host}"
    return TenantDiscoveryResponse(
        tenant_id=school.public_id,
        organization_id=organization.public_id,
        school_id=school.public_id,
        organization_name=organization.name,
        school_name=school.name,
        canonical_host=primary_host,
        primary_host=primary_host,
        matched_host=matched_host,
        api_base_url=f"{web_base_url}/api",
        web_base_url=web_base_url,
        compatibility=TenantCompatibility(mobile_api_version=1, minimum_mobile_api_version=1),
        capabilities=TenantCapabilities(native_mobile=True),
    )


async def _primary_host(db: AsyncSession, school_id: int) -> str | None:
    domain = (
        await db.execute(
            select(SchoolDomain).where(
                SchoolDomain.school_id == school_id,
                SchoolDomain.is_primary.is_(True),
                SchoolDomain.status == "active",
            )
        )
    ).first()
    return domain[0].domain if domain is not None else None


async def _discover(payload: TenantDiscoveryRequest, db: AsyncSession) -> TenantDiscoveryResponse:
    matched_host: str | None = None
    if payload.host is not None:
        try:
            matched_host = normalize_tenant_host(payload.host)
        except ValueError:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_FOUND) from None
        result = (
            await db.execute(
                select(SchoolDomain, School, Organization)
                .join(School, SchoolDomain.school_id == School.id)
                .join(Organization, School.org_id == Organization.id)
                .where(SchoolDomain.domain == matched_host)
            )
        ).first()
        if result is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_FOUND)
        domain, school, organization = result
        if domain.status != "active":
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_FOUND)
    elif payload.school_public_id is not None:
        result = (
            await db.execute(
                select(School, Organization)
                .join(Organization, School.org_id == Organization.id)
                .where(School.public_id == payload.school_public_id)
            )
        ).first()
        if result is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_FOUND)
        school, organization = result
    else:
        try:
            organization_domain = normalize_tenant_host(payload.organization_domain or "")
        except ValueError:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_FOUND) from None
        school_code = (payload.school_code or "").strip().lower()
        result = (
            await db.execute(
                select(School, Organization)
                .join(Organization, School.org_id == Organization.id)
                .where(Organization.domain == organization_domain, School.subdomain == school_code)
            )
        ).first()
        if result is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_FOUND)
        school, organization = result

    if school.status != "active" or organization.status != "active":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_FOUND)
    primary_host = await _primary_host(db, school.id)
    if primary_host is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_FOUND)
    return _response(school, organization, primary_host, matched_host or primary_host)


@router.get("/tenant-discovery", response_model=TenantDiscoveryResponse)
async def discover_tenant(
    host: str = Query(min_length=1, max_length=2048),
    db: AsyncSession = Depends(get_db),
) -> TenantDiscoveryResponse:
    return await _discover(TenantDiscoveryRequest(host=host), db)


@router.post("/tenant-discovery", response_model=TenantDiscoveryResponse)
async def discover_tenant_post(
    payload: TenantDiscoveryRequest,
    db: AsyncSession = Depends(get_db),
) -> TenantDiscoveryResponse:
    return await _discover(payload, db)
