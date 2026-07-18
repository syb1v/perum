from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import SessionLocal
from app.core.docker_client import get_docker_client
from app.core.locks import keyed_lock, school_key
from app.models import Node, NodeAssignment, School, SchoolDeploymentSnapshot, SchoolSecret, SchoolSocialRollout
from app.services.school_provisioner import ProvisioningError, _swap_app
from app.services.stack_spec import build_school_stack_spec, school_label_slug

logger = logging.getLogger("perum.social_rollout")
_tasks: dict[int, asyncio.Task] = {}


def effective(state: SchoolSocialRollout | None) -> bool:
    return bool(state and state.platform_granted and state.org_enabled)


async def get_or_create(db: AsyncSession, school_id: int) -> SchoolSocialRollout:
    state = await db.get(SchoolSocialRollout, school_id)
    if state is None:
        state = SchoolSocialRollout(school_id=school_id)
        db.add(state)
        await db.flush()
    return state


async def desired_runtime(db: AsyncSession, school_id: int) -> tuple[bool, int]:
    state = await db.get(SchoolSocialRollout, school_id)
    return effective(state), state.generation if state else 0


def state_dict(state: SchoolSocialRollout, snapshot: SchoolDeploymentSnapshot | None = None) -> dict:
    desired = effective(state)
    observed_generation = snapshot.social_generation if snapshot else None
    observed_ready = bool(snapshot and snapshot.social_ready)
    fresh = bool(snapshot and datetime.utcnow() - snapshot.received_at <= timedelta(seconds=get_settings().DEPLOYMENT_SNAPSHOT_FRESHNESS_S))
    converged = state.applied_generation == state.generation and observed_generation == state.generation and fresh and observed_ready == desired
    status = "converged" if converged else state.apply_status
    if status == "converged" and not converged:
        status = "drift"
    return {
        "school_id": state.school_id,
        "platform_granted": state.platform_granted,
        "org_enabled": state.org_enabled,
        "effective": desired,
        "generation": state.generation,
        "applied_generation": state.applied_generation,
        "applied_enabled": state.applied_enabled,
        "observed_generation": observed_generation,
        "observed_ready": observed_ready if snapshot else None,
        "status": status,
        "error": state.apply_error,
        "target_seconds": 30,
    }


async def apply_local_runtime(school: School, db: AsyncSession, enabled: bool, generation: int) -> None:
    state = await get_or_create(db, school.id)
    if generation < state.applied_generation:
        raise ProvisioningError("stale generation")
    if generation == state.applied_generation:
        return
    secret = await db.get(SchoolSecret, school.id)
    if secret is None:
        raise ProvisioningError("school secret missing")
    settings = get_settings()
    image = school.release_tag or settings.TENANT_IMAGE
    old_enabled = state.applied_enabled
    old_generation = state.applied_generation
    spec = build_school_stack_spec(school, secret, settings, image=image, social_rollout_enabled=enabled, social_rollout_generation=generation)
    try:
        await _swap_app(spec, school_label_slug(school.slug), image, settings, get_docker_client())
    except Exception:
        rollback = build_school_stack_spec(school, secret, settings, image=image, social_rollout_enabled=old_enabled, social_rollout_generation=old_generation)
        await _swap_app(rollback, school_label_slug(school.slug), image, settings, get_docker_client())
        raise
    state.applied_generation = generation
    state.applied_enabled = enabled
    state.applied_at = datetime.utcnow()
    state.apply_status = "awaiting_heartbeat"
    state.apply_error = None
    await db.commit()


async def reconcile_once(school_id: int) -> None:
    async with keyed_lock(school_key(school_id)):
        async with SessionLocal() as db:
            school = await db.get(School, school_id)
            state = await db.get(SchoolSocialRollout, school_id)
            if school is None or state is None or state.applied_generation >= state.generation:
                return
            state.apply_status = "applying"
            state.apply_error = None
            await db.commit()
            assignment = await db.scalar(select(NodeAssignment).where(NodeAssignment.school_id == school_id))
            try:
                if assignment is None:
                    await apply_local_runtime(school, db, effective(state), state.generation)
                else:
                    from app.services.remote_node_client import RemoteNodeClient
                    node = await db.get(Node, assignment.node_id)
                    if node is None or node.status != "active":
                        raise ConnectionError("node unavailable")
                    response = await RemoteNodeClient(timeout=25).apply_social_runtime(node, school.slug, effective(state), state.generation)
                    if not response.get("success"):
                        raise ProvisioningError(response.get("message") or "agent rejected runtime config")
                    state.applied_generation = int(response["applied_generation"])
                    state.applied_enabled = effective(state)
                    state.applied_at = datetime.utcnow()
                    state.apply_status = "awaiting_heartbeat"
                    await db.commit()
            except Exception as exc:
                from app.services.remote_node_client import RemoteNodeError
                state.apply_status = "enforcement_pending" if isinstance(exc, (ConnectionError, RemoteNodeError)) else "failed"
                state.apply_error = str(exc)[:1000]
                await db.commit()
                raise


async def _reconcile_with_backoff(school_id: int) -> None:
    for delay in (0, 2, 5, 10):
        if delay:
            await asyncio.sleep(delay)
        try:
            await reconcile_once(school_id)
            return
        except Exception:
            logger.warning("social rollout reconcile attempt failed for school %s", school_id)


def schedule_reconcile(school_id: int) -> None:
    if school_id in _tasks:
        return
    task = asyncio.create_task(_reconcile_with_backoff(school_id))
    _tasks[school_id] = task
    task.add_done_callback(lambda _task: _tasks.pop(school_id, None))


async def reconcile_pending() -> None:
    async with SessionLocal() as db:
        ids = (await db.execute(select(SchoolSocialRollout.school_id).where(SchoolSocialRollout.applied_generation < SchoolSocialRollout.generation, SchoolSocialRollout.apply_status == "enforcement_pending"))).scalars().all()
    for school_id in ids:
        schedule_reconcile(school_id)
