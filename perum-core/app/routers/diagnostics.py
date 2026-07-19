from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import require_operator
from app.models import OrgAdmin, PlatformAdmin, School
from app.schemas.diagnostics import DeploymentDescriptorDiagnostic
from app.services.mobile_descriptor import resolve_mobile_descriptor, snapshot_age_bucket

router = APIRouter()


@router.get("/schools/{school_public_id}/deployment-descriptor", response_model=DeploymentDescriptorDiagnostic)
async def deployment_descriptor_diagnostic(
    school_public_id: UUID,
    operator: PlatformAdmin | OrgAdmin = Depends(require_operator),
    db: AsyncSession = Depends(get_db),
) -> DeploymentDescriptorDiagnostic:
    school = (await db.execute(select(School).where(School.public_id == school_public_id))).scalar_one_or_none()
    if school is None or isinstance(operator, OrgAdmin) and school.org_id != operator.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "school not found")
    resolution = await resolve_mobile_descriptor(school, db)
    return DeploymentDescriptorDiagnostic(
        schema_valid=resolution.release_valid,
        release_match=resolution.release_match,
        snapshot_present=resolution.snapshot_present,
        snapshot_fresh=resolution.snapshot_fresh,
        snapshot_age_bucket=snapshot_age_bucket(resolution.snapshot_age_seconds),
        snapshot_accepted=resolution.snapshot_fresh and resolution.release_match,
        social_rollout_converged=resolution.social_rollout_converged,
        effective_capabilities=resolution.capabilities,
    )
