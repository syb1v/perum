from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, StrictBool
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import require_org_admin, require_platform_admin
from app.models import OrgAdmin, PlatformAdmin, School, SchoolDeploymentSnapshot, SchoolSocialRolloutAudit
from app.services.social_rollout import get_or_create, schedule_reconcile, state_dict

platform_router = APIRouter(dependencies=[Depends(require_platform_admin)])
org_router = APIRouter(dependencies=[Depends(require_org_admin)])


class PlatformGrantPatch(BaseModel):
    platform_granted: StrictBool


class OrgEnablePatch(BaseModel):
    org_enabled: StrictBool


async def _out(db: AsyncSession, school: School) -> dict:
    state = await get_or_create(db, school.id)
    snapshot = await db.get(SchoolDeploymentSnapshot, school.id)
    return {**state_dict(state, snapshot), "school_name": school.name, "org_id": school.org_id}


@platform_router.get("/social-rollouts")
async def list_platform_rollouts(db: AsyncSession = Depends(get_db)) -> dict:
    schools = (await db.execute(select(School).order_by(School.org_id, School.id))).scalars().all()
    return {"items": [await _out(db, school) for school in schools]}


@platform_router.get("/schools/{school_id}/social-rollout")
async def get_platform_rollout(school_id: int, db: AsyncSession = Depends(get_db)) -> dict:
    school = await db.get(School, school_id)
    if school is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "school not found")
    return await _out(db, school)


@platform_router.put("/schools/{school_id}/social-rollout")
async def set_platform_rollout(payload: PlatformGrantPatch, school_id: int, admin: PlatformAdmin = Depends(require_platform_admin), db: AsyncSession = Depends(get_db)) -> dict:
    school = await db.get(School, school_id)
    if school is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "school not found")
    await db.execute(select(School.id).where(School.id == school_id).with_for_update())
    state = await get_or_create(db, school_id)
    changed = state.platform_granted != payload.platform_granted or (not payload.platform_granted and state.org_enabled)
    if changed:
        state.platform_granted = payload.platform_granted
        if not payload.platform_granted:
            state.org_enabled = False
        state.generation += 1
        state.desired_at = datetime.utcnow()
        state.updated_at = datetime.utcnow()
        state.apply_status = "enforcement_pending"
        state.apply_error = None
        db.add(SchoolSocialRolloutAudit(school_id=school_id, actor_type="platform_admin", actor_id=admin.id, action="grant" if payload.platform_granted else "revoke", generation=state.generation, platform_granted=state.platform_granted, org_enabled=state.org_enabled))
        await db.commit()
        schedule_reconcile(school_id)
    return await _out(db, school)


async def _org_school(db: AsyncSession, school_id: int, admin: OrgAdmin) -> School:
    school = await db.get(School, school_id)
    if school is None or school.org_id != admin.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "school not found")
    return school


@org_router.get("/{school_id}/social-rollout")
async def get_org_rollout(school_id: int, admin: OrgAdmin = Depends(require_org_admin), db: AsyncSession = Depends(get_db)) -> dict:
    return await _out(db, await _org_school(db, school_id, admin))


@org_router.put("/{school_id}/social-rollout")
async def set_org_rollout(payload: OrgEnablePatch, school_id: int, admin: OrgAdmin = Depends(require_org_admin), db: AsyncSession = Depends(get_db)) -> dict:
    school = await _org_school(db, school_id, admin)
    await db.execute(select(School.id).where(School.id == school_id).with_for_update())
    state = await get_or_create(db, school_id)
    if payload.org_enabled and not state.platform_granted:
        raise HTTPException(status.HTTP_409_CONFLICT, "platform grant required")
    if state.org_enabled != payload.org_enabled:
        state.org_enabled = payload.org_enabled
        state.generation += 1
        state.desired_at = datetime.utcnow()
        state.updated_at = datetime.utcnow()
        state.apply_status = "enforcement_pending"
        state.apply_error = None
        db.add(SchoolSocialRolloutAudit(school_id=school_id, actor_type="org_admin", actor_id=admin.id, action="enable" if payload.org_enabled else "disable", generation=state.generation, platform_granted=state.platform_granted, org_enabled=state.org_enabled))
        await db.commit()
        schedule_reconcile(school_id)
    return await _out(db, school)
