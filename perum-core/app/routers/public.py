import hashlib
import ipaddress
import json
import logging
from datetime import datetime, timedelta, timezone
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import get_db
from app.core.ratelimit import check_discovery_rate
from app.models import Organization, OrganizationDomain, Release, School, SchoolDeploymentSnapshot, SchoolDomain
from app.schemas.mobile_descriptor import MobileReleaseManifestV1
from app.schemas.public import (
    TenantCapabilities,
    TenantCompatibility,
    TenantDiscoveryRequest,
    TenantDiscoveryResponse,
)

router = APIRouter()

_NOT_FOUND = "Tenant not found"
logger = logging.getLogger(__name__)

_CONSERVATIVE_COMPATIBILITY = TenantCompatibility(
    mobile_api_version=1,
    minimum_mobile_api_version=1,
    minimum_app_version="0.0.0",
)
_CONSERVATIVE_CAPABILITIES = TenantCapabilities(
    **dict.fromkeys(TenantCapabilities.model_fields, False)
)
_DEPLOYMENT_CAPABILITIES = {
    "push_registration": "push_registration_ready",
    "push_delivery": "push_delivery_ready",
    "social_realtime": "realtime_ready",
    "social_attachments": "scanner_ready",
    "support_attachments": "scanner_ready",
}


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


async def _mobile_contract(school: School, db: AsyncSession) -> tuple[int, TenantCompatibility, TenantCapabilities]:
    if not school.release_tag:
        logger.warning(
            "mobile_descriptor_resolution_failed",
            extra={"descriptor_reason": "missing_release", "school_id": school.id},
        )
        return 1, _CONSERVATIVE_COMPATIBILITY, _CONSERVATIVE_CAPABILITIES

    release = (
        await db.execute(select(Release).where(Release.image == school.release_tag).limit(1))
    ).scalar_one_or_none()
    if release is None:
        logger.warning(
            "mobile_descriptor_resolution_failed",
            extra={"descriptor_reason": "unknown_release", "school_id": school.id},
        )
        return 1, _CONSERVATIVE_COMPATIBILITY, _CONSERVATIVE_CAPABILITIES

    try:
        manifest = MobileReleaseManifestV1.model_validate(
            {
                "schema_version": release.mobile_descriptor_schema_version,
                "compatibility": release.mobile_compatibility,
                "capabilities": release.mobile_build_capabilities,
            }
        )
    except ValueError:
        logger.warning(
            "mobile_descriptor_resolution_failed",
            extra={"descriptor_reason": "invalid_manifest", "school_id": school.id, "release_id": release.id},
        )
        return 1, _CONSERVATIVE_COMPATIBILITY, _CONSERVATIVE_CAPABILITIES

    capabilities = TenantCapabilities.model_validate(manifest.capabilities.model_dump())
    snapshot = await db.get(SchoolDeploymentSnapshot, school.id)
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    freshness = timedelta(seconds=get_settings().DEPLOYMENT_SNAPSHOT_FRESHNESS_S)
    snapshot_reason = None
    if snapshot is None:
        snapshot_reason = "missing_snapshot"
    elif snapshot.release_image != school.release_tag:
        snapshot_reason = "release_mismatch"
    elif snapshot.observed_at > now or now - snapshot.observed_at > freshness:
        snapshot_reason = "stale_snapshot"
    if snapshot_reason is not None:
        logger.warning(
            "mobile_descriptor_deployment_unavailable",
            extra={"descriptor_reason": snapshot_reason, "school_id": school.id},
        )
    effective = capabilities.model_dump()
    for capability, readiness in _DEPLOYMENT_CAPABILITIES.items():
        effective[capability] = effective[capability] and bool(
            snapshot is not None and snapshot_reason is None and getattr(snapshot, readiness)
        )
    return (
        manifest.schema_version,
        TenantCompatibility.model_validate(manifest.compatibility.model_dump()),
        TenantCapabilities.model_validate(effective),
    )


async def _response(
    school: School,
    organization: Organization,
    primary_host: str,
    matched_host: str,
    db: AsyncSession,
) -> TenantDiscoveryResponse:
    web_base_url = f"https://{primary_host}"
    schema_version, compatibility, capabilities = await _mobile_contract(school, db)
    revision_payload = {
        "tenant_id": str(school.public_id),
        "organization_id": str(organization.public_id),
        "school_id": str(school.public_id),
        "organization_name": organization.name,
        "school_name": school.name,
        "primary_host": primary_host,
        "api_base_url": f"{web_base_url}/api",
        "web_base_url": web_base_url,
        "schema_version": schema_version,
        "compatibility": compatibility.model_dump(),
        "capabilities": capabilities.model_dump(),
    }
    descriptor_revision = hashlib.sha256(
        json.dumps(revision_payload, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
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
        descriptor_revision=descriptor_revision,
        cache_ttl_seconds=get_settings().DISCOVERY_CACHE_TTL_S,
        schema_version=schema_version,
        compatibility=compatibility,
        capabilities=capabilities,
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
                .join(OrganizationDomain, OrganizationDomain.org_id == Organization.id)
                .where(
                    OrganizationDomain.domain == organization_domain,
                    OrganizationDomain.status == "active",
                    School.subdomain == school_code,
                )
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
    return await _response(school, organization, primary_host, matched_host or primary_host, db)


@router.get("/tenant-discovery", response_model=TenantDiscoveryResponse)
async def discover_tenant(
    request: Request,
    host: str = Query(min_length=1, max_length=2048),
    db: AsyncSession = Depends(get_db),
) -> TenantDiscoveryResponse:
    check_discovery_rate(request)
    return await _discover(TenantDiscoveryRequest(host=host), db)


@router.post("/tenant-discovery", response_model=TenantDiscoveryResponse)
async def discover_tenant_post(
    request: Request,
    payload: TenantDiscoveryRequest,
    db: AsyncSession = Depends(get_db),
) -> TenantDiscoveryResponse:
    check_discovery_rate(request)
    return await _discover(payload, db)
