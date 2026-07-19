import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models import Release, School, SchoolDeploymentSnapshot, SchoolSocialRollout
from app.schemas.mobile_descriptor import MobileReleaseManifestV1
from app.schemas.public import TenantCapabilities, TenantCompatibility
from app.services.descriptor_observability import observe_descriptor_reason

logger = logging.getLogger("app.routers.public")

_CONSERVATIVE_COMPATIBILITY = TenantCompatibility(mobile_api_version=1, minimum_mobile_api_version=1, minimum_app_version="0.0.0")
_CONSERVATIVE_CAPABILITIES = TenantCapabilities(**dict.fromkeys(TenantCapabilities.model_fields, False))
_DEPLOYMENT_CAPABILITIES = {
    "push_registration": "push_registration_ready",
    "push_delivery": "push_delivery_ready",
    "social_realtime": "realtime_ready",
    "social_attachments": "scanner_ready",
    "support_attachments": "scanner_ready",
}
_SOCIAL_CAPABILITIES = {name for name in TenantCapabilities.model_fields if "social" in name}


@dataclass(frozen=True)
class MobileDescriptorResolution:
    schema_version: int
    compatibility: TenantCompatibility
    capabilities: TenantCapabilities
    release_valid: bool
    release_match: bool
    snapshot_present: bool
    snapshot_fresh: bool
    snapshot_age_seconds: int | None
    social_rollout_converged: bool


def snapshot_age_bucket(age_seconds: int | None) -> str:
    if age_seconds is None:
        return "absent"
    if age_seconds < 0:
        return "future"
    if age_seconds < 60:
        return "lt_1m"
    if age_seconds < 300:
        return "1m_5m"
    if age_seconds < 900:
        return "5m_15m"
    if age_seconds < 3600:
        return "15m_1h"
    return "gte_1h"


def _observe(reason: str, message: str) -> None:
    observe_descriptor_reason(reason)
    logger.warning("%s reason=%s", message, reason, extra={"descriptor_reason": reason})


async def resolve_mobile_descriptor(school: School, db: AsyncSession) -> MobileDescriptorResolution:
    if not school.release_tag:
        _observe("missing_release", "mobile_descriptor_resolution_failed")
        return MobileDescriptorResolution(1, _CONSERVATIVE_COMPATIBILITY, _CONSERVATIVE_CAPABILITIES, False, False, False, False, None, False)
    release = (await db.execute(select(Release).where(Release.image == school.release_tag).limit(1))).scalar_one_or_none()
    if release is None:
        _observe("unknown_release", "mobile_descriptor_resolution_failed")
        return MobileDescriptorResolution(1, _CONSERVATIVE_COMPATIBILITY, _CONSERVATIVE_CAPABILITIES, False, False, False, False, None, False)
    try:
        manifest = MobileReleaseManifestV1.model_validate({
            "schema_version": release.mobile_descriptor_schema_version,
            "compatibility": release.mobile_compatibility,
            "capabilities": release.mobile_build_capabilities,
        })
    except ValueError:
        _observe("invalid_manifest", "mobile_descriptor_resolution_failed")
        return MobileDescriptorResolution(1, _CONSERVATIVE_COMPATIBILITY, _CONSERVATIVE_CAPABILITIES, False, False, False, False, None, False)
    capabilities = TenantCapabilities.model_validate(manifest.capabilities.model_dump())
    snapshot = await db.get(SchoolDeploymentSnapshot, school.id)
    rollout = await db.get(SchoolSocialRollout, school.id)
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    freshness = timedelta(seconds=get_settings().DEPLOYMENT_SNAPSHOT_FRESHNESS_S)
    age_seconds = int((now - snapshot.observed_at).total_seconds()) if snapshot is not None else None
    reason = None
    if snapshot is None:
        reason = "missing_snapshot"
    elif snapshot.release_image != school.release_tag:
        reason = "release_mismatch"
    elif snapshot.observed_at > now or now - snapshot.observed_at > freshness:
        reason = "stale_snapshot"
    if reason:
        _observe(reason, "mobile_descriptor_deployment_unavailable")
    effective = capabilities.model_dump()
    for capability, readiness in _DEPLOYMENT_CAPABILITIES.items():
        effective[capability] = effective[capability] and bool(snapshot is not None and reason is None and getattr(snapshot, readiness))
    desired_social = bool(rollout and rollout.platform_granted and rollout.org_enabled)
    social_rollout_converged = bool(
        desired_social
        and snapshot is not None
        and reason is None
        and snapshot.social_ready
        and getattr(snapshot, "social_generation", 0) == rollout.generation
    )
    for capability in _SOCIAL_CAPABILITIES:
        effective[capability] = effective[capability] and social_rollout_converged
    return MobileDescriptorResolution(
        manifest.schema_version,
        TenantCompatibility.model_validate(manifest.compatibility.model_dump()),
        TenantCapabilities.model_validate(effective),
        True,
        bool(snapshot is not None and snapshot.release_image == school.release_tag),
        snapshot is not None,
        snapshot is not None and reason is None,
        age_seconds,
        social_rollout_converged,
    )
