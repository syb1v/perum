import ipaddress
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.models import Organization, School, SchoolDomain
from app.schemas.public import TenantCapabilities, TenantCompatibility, TenantDiscoveryResponse

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


def _response(school: School, host: str) -> TenantDiscoveryResponse:
    web_base_url = f"https://{host}"
    return TenantDiscoveryResponse(
        school_name=school.name,
        canonical_host=host,
        api_base_url=f"{web_base_url}/api",
        web_base_url=web_base_url,
        compatibility=TenantCompatibility(mobile_api_version=1, minimum_mobile_api_version=1),
        capabilities=TenantCapabilities(native_mobile=True),
    )


@router.get("/tenant-discovery", response_model=TenantDiscoveryResponse)
async def discover_tenant(
    host: str = Query(min_length=1, max_length=2048),
    db: AsyncSession = Depends(get_db),
) -> TenantDiscoveryResponse:
    try:
        normalized_host = normalize_tenant_host(host)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_FOUND) from None

    authoritative = (
        await db.execute(
            select(SchoolDomain, School, Organization)
            .join(School, SchoolDomain.school_id == School.id)
            .join(Organization, School.org_id == Organization.id)
            .where(SchoolDomain.domain == normalized_host)
        )
    ).first()
    if authoritative is not None:
        domain, school, organization = authoritative
        if domain.status == "active" and school.status == "active" and organization.status == "active":
            return _response(school, normalized_host)
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_FOUND)

    derived = (
        await db.execute(
            select(School, Organization)
            .join(Organization, School.org_id == Organization.id)
            .where(
                School.status == "active",
                Organization.status == "active",
                School.subdomain.is_not(None),
                Organization.domain.is_not(None),
            )
        )
    ).all()
    for school, organization in derived:
        try:
            candidate = normalize_tenant_host(f"{school.subdomain}.{organization.domain}")
        except ValueError:
            continue
        if candidate == normalized_host:
            return _response(school, candidate)

    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_FOUND)
