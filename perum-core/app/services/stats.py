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
_SUPPORT_KEYS = ("pending", "retrying", "sla_breached", "oldest_pending_age_seconds")


def support_delivery(metric: SchoolMetric | None, now: datetime) -> dict | None:
    if not metric or not metric.last_heartbeat_at or (now - metric.last_heartbeat_at).total_seconds() > HEARTBEAT_FRESH_S:
        return None
    payload = metric.payload if isinstance(metric.payload, dict) else None
    raw = payload.get("support_escalation_delivery") if payload else None
    if not isinstance(raw, dict):
        return None
    values = {}
    for key in _SUPPORT_KEYS:
        value = raw.get(key)
        if isinstance(value, bool) or not isinstance(value, int) or value < 0:
            return None
        values[key] = value
    values["telemetry_status"] = "critical" if values["sla_breached"] else "warning" if values["pending"] or values["retrying"] else "healthy"
    return values


def support_delivery_rollup(schools: list[dict]) -> dict:
    reporting = [school["support_escalation_delivery"] for school in schools if school["support_escalation_delivery"] is not None]
    return {
        "pending": sum(item["pending"] for item in reporting),
        "retrying": sum(item["retrying"] for item in reporting),
        "sla_breached": sum(item["sla_breached"] for item in reporting),
        "oldest_pending_age_seconds": max((item["oldest_pending_age_seconds"] for item in reporting), default=0),
        "schools_reporting": len(reporting),
        "schools_unknown": len(schools) - len(reporting),
    }


def is_online(school: School, metric: SchoolMetric | None, now: datetime) -> bool:
    if school.status != "active":
        return False
    if not metric or metric.last_heartbeat_at is None:
        return True  # active, контейнеры только поднялись — телеметрии ещё нет
    return (now - metric.last_heartbeat_at).total_seconds() <= HEARTBEAT_FRESH_S


def school_stat(school: School, metric: SchoolMetric | None, now: datetime) -> dict:
    d = {
        "id": school.id,
        "slug": school.slug,
        "name": school.name,
        "status": school.status,
        "online": is_online(school, metric, now),
        "last_heartbeat_at": metric.last_heartbeat_at.isoformat() if metric and metric.last_heartbeat_at else None,
        "avg_grade": metric.avg_grade if metric else None,
        "support_escalation_delivery": support_delivery(metric, now),
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
    agg["support_escalation_delivery"] = support_delivery_rollup(schools)
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
