"""Приёмник телеметрии от школьных стеков (R3). Публичный путь, аутентификация —
по per-school TELEMETRY_TOKEN (как у /internal-RPC), не по платформенному токену.
Тенант шлёт агрегаты без PII; ядро складывает последний снимок на школу."""

from __future__ import annotations

import secrets as secrets_mod
import time
from collections import defaultdict, deque
from datetime import datetime

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.ratelimit import _client_ip
from app.models import School, SchoolMetric, SchoolSecret

router = APIRouter()

# Defense-in-depth: путь дополнительно закрыт от интернета в Caddyfile.prod (школы
# ходят в ядро напрямую по docker-сети). Здесь — щедрый IP-троттлинг на случай,
# если путь всё же достижим: легитимная школа шлёт ~1/60с с одного IP.
_INGEST_LIMIT = 60
_INGEST_WINDOW_S = 60
_hits: dict[str, deque[float]] = defaultdict(deque)


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

    m = payload.metrics or {}
    metric = await db.get(SchoolMetric, school.id)
    if metric is None:
        metric = SchoolMetric(school_id=school.id)
        db.add(metric)
    now = datetime.utcnow()
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
