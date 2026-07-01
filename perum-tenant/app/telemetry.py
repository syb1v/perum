"""Телеметрия школьного стека → ядро (R3, см. docs/AUDIT_2026-06-12.md).

Раз в TELEMETRY_INTERVAL_S тенант POST'ит в ядро АГРЕГАТЫ без PII (счётчики
пользователей по ролям, число оценок, средний балл, активность за 24ч, сумма
ливок). Ядро складывает снимок и отдаёт статистику platform_admin'у и org_admin'у.
Это закрывает инвариант изоляции: наверх уходят только числа, не персональные данные.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta

import httpx
from sqlalchemy import distinct, func, select

from app.core.config import get_settings
from app.core.db import SessionLocal
from app.core.roles import DIRECTOR, PARENT, SCHOOL_ADMIN, STUDENT, TEACHER
from app.models import Grade, PageVisit, School, User

logger = logging.getLogger("perum.telemetry")


async def collect_metrics(db, school_id: int) -> dict:
    """Снимок агрегатов школы (без PII)."""
    role_rows = (
        await db.execute(
            select(User.role, func.count(User.id)).where(User.school_id == school_id).group_by(User.role)
        )
    ).all()
    by_role = {r: int(c) for r, c in role_rows}
    students = by_role.get(STUDENT, 0)
    teachers = by_role.get(TEACHER, 0)
    parents = by_role.get(PARENT, 0)
    admins = by_role.get(SCHOOL_ADMIN, 0) + by_role.get(DIRECTOR, 0)
    users_total = sum(by_role.values())

    grades_total = int(await db.scalar(select(func.count(Grade.id)).where(Grade.school_id == school_id)) or 0)
    avg_raw = await db.scalar(
        select(func.avg(Grade.grade_value)).where(Grade.school_id == school_id, Grade.grade_value.isnot(None))
    )
    avg_grade = round(float(avg_raw), 2) if avg_raw is not None else None

    since = datetime.utcnow() - timedelta(hours=24)
    active_24h = int(await db.scalar(
        select(func.count(distinct(PageVisit.user_id))).where(
            PageVisit.school_id == school_id, PageVisit.user_id.isnot(None), PageVisit.created_at >= since
        )
    ) or 0)
    balance_total = int(await db.scalar(
        select(func.coalesce(func.sum(User.balance), 0)).where(User.school_id == school_id)
    ) or 0)

    return {
        "users_total": users_total,
        "students": students,
        "teachers": teachers,
        "parents": parents,
        "admins": admins,
        "grades_total": grades_total,
        "avg_grade": avg_grade,
        "active_24h": active_24h,
        "balance_total": balance_total,
    }


async def send_once() -> None:
    s = get_settings()
    if not s.TELEMETRY_TOKEN or not s.CONTROL_PLANE_URL:
        return
    async with SessionLocal() as db:
        # Архитектура v2: один стек = одна школа, поэтому берём её (первую и
        # единственную). slug стека (ORG_SLUG) = slug этой школы в ядре.
        school_id = await db.scalar(select(School.id).order_by(School.id).limit(1))
        if school_id is None:
            return
        metrics = await collect_metrics(db, school_id)
    body = {"slug": s.ORG_SLUG, "metrics": metrics}
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            f"{s.CONTROL_PLANE_URL.rstrip('/')}/api/telemetry",
            headers={"X-Telemetry-Token": s.TELEMETRY_TOKEN},
            json=body,
        )
        if resp.status_code >= 300:
            logger.warning("telemetry rejected: %s %s", resp.status_code, resp.text[:200])


async def telemetry_loop() -> None:
    """Фоновая петля отправки. Сбой одной итерации не валит цикл."""
    s = get_settings()
    interval = s.TELEMETRY_INTERVAL_S
    if interval <= 0 or not s.TELEMETRY_TOKEN:
        logger.info("telemetry disabled (interval<=0 or no token)")
        return
    # Небольшая задержка на старте: дать БД/миграциям прогреться.
    await asyncio.sleep(5)
    while True:
        try:
            await send_once()
        except Exception as exc:  # noqa: BLE001
            logger.warning("telemetry send failed: %s", exc)
        await asyncio.sleep(interval)
