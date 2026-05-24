"""Shared read endpoints mounted directly under /api (legacy-compatible paths).

These are consumed across roles (the student schedule page, teacher pickers,
admin screens): the subject list, active learning periods, and a news-unread
counter. News itself lands in Phase 8 — the counter is a stub returning 0 so the
copied dashboard renders without erroring.
"""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import get_current_user
from app.models import Subject, User
from app.models.academic import Class
from app.modules.journal.service import _list_periods
from app.modules.school_admin.service import resolve_school_id

router = APIRouter()


def _as_date(value):
    return value.date() if isinstance(value, datetime) else value


@router.get("/subjects")
async def subjects(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> dict:
    school_id = await resolve_school_id(user, db)
    rows = (
        await db.execute(select(Subject).where(Subject.school_id == school_id).order_by(Subject.name))
    ).scalars().all()
    return {
        "subjects": [
            {"id": s.id, "name": s.name, "short_name": s.short_name, "category": s.category} for s in rows
        ]
    }


@router.get("/periods")
async def periods(
    class_id: int | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    school_id = await resolve_school_id(user, db)

    period_type = "quarter"
    if class_id is not None:
        cls = (
            await db.execute(select(Class).where(Class.id == class_id, Class.school_id == school_id))
        ).scalar_one_or_none()
        if cls and (cls.grade_level or 1) >= 10:
            period_type = "half_year"

    all_periods = await _list_periods(db, school_id)
    keep = {period_type, "holiday", "vacation"}
    visible = [p for p in all_periods if p.period_type in keep]

    def _dump(p) -> dict:
        return {
            "id": p.id,
            "name": p.name,
            "period_type": p.period_type,
            "start_date": p.start_date.isoformat() if p.start_date else None,
            "end_date": p.end_date.isoformat() if p.end_date else None,
        }

    today = datetime.now().date()
    current = None
    for p in visible:
        if p.period_type in {"quarter", "half_year"} and _as_date(p.start_date) <= today <= _as_date(p.end_date):
            current = _dump(p)
            break
    if current is None:  # fall back to the most recent finished period
        for p in reversed(visible):
            if p.period_type in {"quarter", "half_year"} and _as_date(p.end_date) <= today:
                current = _dump(p)
                break

    return {"current_period": current, "periods": [_dump(p) for p in visible]}


@router.get("/news/unread-count")
async def news_unread_count(user: User = Depends(get_current_user)) -> dict:
    # News module arrives in Phase 8; nothing unread yet.
    return {"count": 0}
