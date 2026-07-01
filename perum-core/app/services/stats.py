"""Агрегация статистики платформы/орг/школ из снимков телеметрии (R3).

Источник — таблица school_metrics (последний снимок на школу + last_heartbeat).
Liveness школы определяется свежестью heartbeat (а не строкой статуса в БД) — это
закрывает претензию аудита «статус школы = запись БД, а не живое состояние»."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Organization, School, SchoolMetric

# Школа считается «онлайн», если heartbeat не старше этого окна (≈3 интервала по 60с).
HEARTBEAT_FRESH_S = 180

_AGG_KEYS = (
    "users_total", "students", "teachers", "parents", "admins",
    "grades_total", "active_24h", "balance_total",
)


def is_online(metric: SchoolMetric | None, now: datetime) -> bool:
    if not metric or metric.last_heartbeat_at is None:
        return False
    return (now - metric.last_heartbeat_at).total_seconds() <= HEARTBEAT_FRESH_S


def school_stat(school: School, metric: SchoolMetric | None, now: datetime) -> dict:
    d = {
        "id": school.id,
        "slug": school.slug,
        "name": school.name,
        "status": school.status,
        "online": is_online(metric, now),
        "last_heartbeat_at": metric.last_heartbeat_at.isoformat() if metric and metric.last_heartbeat_at else None,
        "avg_grade": metric.avg_grade if metric else None,
    }
    for k in _AGG_KEYS:
        d[k] = getattr(metric, k) if metric else 0
    return d


async def schools_with_metrics(db: AsyncSession, org_id: int | None = None) -> list[tuple[School, SchoolMetric | None]]:
    """Школы (не archived) + их последний снимок телеметрии (LEFT JOIN)."""
    q = (
        select(School, SchoolMetric)
        .outerjoin(SchoolMetric, SchoolMetric.school_id == School.id)
        .where(School.status != "archived")
    )
    if org_id is not None:
        q = q.where(School.org_id == org_id)
    return list((await db.execute(q.order_by(School.id))).all())


def rollup(rows: list[tuple[School, SchoolMetric | None]], now: datetime) -> tuple[dict, list[dict]]:
    schools = [school_stat(s, m, now) for s, m in rows]
    agg: dict = {
        "schools_total": len(schools),
        "schools_online": sum(1 for s in schools if s["online"]),
    }
    for k in _AGG_KEYS:
        agg[k] = sum(s[k] for s in schools)
    return agg, schools


async def platform_stats(db: AsyncSession, now: datetime) -> dict:
    rows = await schools_with_metrics(db)
    agg, _ = rollup(rows, now)
    org_rows = (await db.execute(select(Organization.status, func.count()).group_by(Organization.status))).all()
    orgs = (await db.execute(select(Organization).order_by(Organization.id))).scalars().all()
    per_org = []
    for o in orgs:
        o_rows = [(s, m) for (s, m) in rows if s.org_id == o.id]
        o_agg, _ = rollup(o_rows, now)
        per_org.append({"slug": o.slug, "name": o.name, "status": o.status, "plan": o.plan, **o_agg})
    return {
        "organizations_total": len(orgs),
        "organizations_by_status": {s: int(c) for s, c in org_rows},
        **agg,
        "per_org": per_org,
    }
