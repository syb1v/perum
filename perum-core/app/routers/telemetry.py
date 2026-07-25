"""Приёмник телеметрии от школьных стеков (R3). Публичный путь, аутентификация —
по per-school TELEMETRY_TOKEN (как у /internal-RPC), не по платформенному токену.
Тенант шлёт агрегаты без PII; ядро складывает последний снимок на школу."""

from __future__ import annotations

from math import isfinite
import secrets as secrets_mod
import time
from collections import defaultdict, deque
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.schemas import SchoolDeploymentSnapshotV1
from app.core.db import get_db
from app.core.ratelimit import _client_ip
from app.models import School, SchoolDeploymentSnapshot, SchoolMetric, SchoolSecret, SchoolSocialRollout

router = APIRouter()

# Defense-in-depth: путь дополнительно закрыт от интернета в Caddyfile.prod (школы
# ходят в ядро напрямую по docker-сети). Здесь — щедрый IP-троттлинг на случай,
# если путь всё же достижим: легитимная школа шлёт ~1/60с с одного IP.
_INGEST_LIMIT = 60
_INGEST_WINDOW_S = 60
_hits: dict[str, deque[float]] = defaultdict(deque)
_METRIC_SCALARS = {
    "users_total", "students", "teachers", "parents", "admins", "grades_total",
    "avg_grade", "active_24h", "balance_total",
}
_METRIC_SECTIONS = {
    "social": {
        "operator_enabled", "school_enabled", "history_deletion_pending",
        "friendships_active", "friend_requests_pending", "blocks_active",
        "conversations", "messages", "reports",
    },
    "scanner": {"backlog"},
    "support_escalation_delivery": {
        "pending", "retrying", "failed", "sla_breached", "oldest_pending_age_seconds",
    },
}


def _throttle(request: Request) -> None:
    ip = _client_ip(request)
    now = time.monotonic()
    dq = _hits[ip]
    while dq and now - dq[0] > _INGEST_WINDOW_S:
        dq.popleft()
    if len(dq) >= _INGEST_LIMIT:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "too many telemetry posts")
    dq.append(now)


class TelemetryIn(BaseModel):
    slug: str
    metrics: dict = {}
    deployment_snapshot: SchoolDeploymentSnapshotV1 | None = None


def _sanitize_metrics(raw: dict) -> dict:
    metrics = {}
    for key in _METRIC_SCALARS:
        value = raw.get(key)
        if key == "avg_grade":
            if value is None or not isinstance(value, bool) and isinstance(value, (int, float)) and isfinite(value) and value >= 0:
                metrics[key] = value
        elif isinstance(value, int) and not isinstance(value, bool) and value >= 0:
            metrics[key] = value
    for section, fields in _METRIC_SECTIONS.items():
        value = raw.get(section)
        if not isinstance(value, dict) or set(value) != fields:
            continue
        if section == "social":
            booleans = {"operator_enabled", "school_enabled", "history_deletion_pending"}
            valid = all(
                isinstance(item, bool) if key in booleans else isinstance(item, int) and not isinstance(item, bool) and item >= 0
                for key, item in value.items()
            )
        else:
            valid = all(isinstance(item, int) and not isinstance(item, bool) and item >= 0 for item in value.values())
        if valid:
            metrics[section] = value
    return metrics


@router.post("")
async def ingest(
    payload: TelemetryIn,
    request: Request,
    x_telemetry_token: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
) -> dict:
    _throttle(request)
    if not x_telemetry_token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "telemetry token required")
    school = (await db.execute(select(School).where(School.slug == payload.slug))).scalar_one_or_none()
    secret = await db.get(SchoolSecret, school.id) if school is not None else None
    # Единый 401 и при неизвестной школе, и при неверном токене — не раскрываем,
    # какие школы заведены (оракул существования). Сравнение constant-time.
    if secret is None or not secrets_mod.compare_digest(secret.telemetry_token, x_telemetry_token):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid telemetry token")

    snapshot = payload.deployment_snapshot
    if snapshot is not None:
        if snapshot.school_id != school.public_id:
            raise HTTPException(status.HTTP_409_CONFLICT, "deployment snapshot school mismatch")
        if snapshot.release_image != school.release_tag:
            raise HTTPException(status.HTTP_409_CONFLICT, "deployment snapshot release mismatch")
        await db.execute(select(School.id).where(School.id == school.id).with_for_update())
        deployment = await db.get(SchoolDeploymentSnapshot, school.id)
        observed_at = snapshot.observed_at.astimezone(timezone.utc).replace(tzinfo=None)
        if deployment is not None and observed_at <= deployment.observed_at:
            raise HTTPException(status.HTTP_409_CONFLICT, "deployment snapshot is not newer")
        if deployment is None:
            deployment = SchoolDeploymentSnapshot(school_id=school.id)
            db.add(deployment)
        deployment.schema_version = snapshot.schema_version
        deployment.release_image = snapshot.release_image
        deployment.scanner_ready = snapshot.scanner_ready
        deployment.realtime_ready = snapshot.realtime_ready
        deployment.push_registration_ready = snapshot.push_registration_ready
        deployment.push_delivery_ready = snapshot.push_delivery_ready
        deployment.social_ready = snapshot.social_ready
        deployment.social_generation = snapshot.social_generation
        deployment.observed_at = observed_at
        deployment.received_at = datetime.now(timezone.utc).replace(tzinfo=None)
        rollout = await db.get(SchoolSocialRollout, school.id)
        if rollout is not None and snapshot.social_generation == rollout.generation and snapshot.social_ready == (rollout.platform_granted and rollout.org_enabled):
            rollout.apply_status = "converged"
            rollout.apply_error = None

    m = _sanitize_metrics(payload.metrics or {})
    metric = await db.get(SchoolMetric, school.id)
    if metric is None:
        metric = SchoolMetric(school_id=school.id)
        db.add(metric)
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    metric.last_heartbeat_at = now
    metric.updated_at = now
    metric.users_total = int(m.get("users_total") or 0)
    metric.students = int(m.get("students") or 0)
    metric.teachers = int(m.get("teachers") or 0)
    metric.parents = int(m.get("parents") or 0)
    metric.admins = int(m.get("admins") or 0)
    metric.grades_total = int(m.get("grades_total") or 0)
    av = m.get("avg_grade")
    metric.avg_grade = float(av) if av is not None else None
    metric.active_24h = int(m.get("active_24h") or 0)
    metric.balance_total = int(m.get("balance_total") or 0)
    metric.payload = m
    await db.commit()
    return {"ok": True}
