"""Academic years, school periods, bell schedules — CRUD."""

from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.academic import (
    AcademicYear,
    BellSchedule,
    BellScheduleItem,
    Class,
    SchoolPeriod,
)
from app.modules.school_admin.schemas import (
    AcademicYearCreate,
    AcademicYearUpdate,
    BellScheduleCreate,
    BellScheduleUpdate,
    SchoolPeriodCreate,
    SchoolPeriodUpdate,
)


def _iso(dt):
    return dt.isoformat() if dt else None


# ---- Academic years ----
async def list_academic_years(db: AsyncSession, school_id: int) -> list[dict]:
    rows = (
        await db.execute(
            select(AcademicYear)
            .where(AcademicYear.school_id == school_id)
            .order_by(AcademicYear.start_date.desc())
        )
    ).scalars().all()
    return [
        {
            "id": y.id,
            "name": y.name,
            "start_date": _iso(y.start_date),
            "end_date": _iso(y.end_date),
            "is_current": y.is_current,
        }
        for y in rows
    ]


async def _get_year(db, school_id, year_id) -> AcademicYear:
    y = (
        await db.execute(
            select(AcademicYear).where(AcademicYear.id == year_id, AcademicYear.school_id == school_id)
        )
    ).scalar_one_or_none()
    if y is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Учебный год не найден")
    return y


async def create_academic_year(db, school_id, data: AcademicYearCreate) -> AcademicYear:
    if data.is_current:
        await _clear_current_year(db, school_id)
    y = AcademicYear(
        school_id=school_id,
        name=data.name,
        start_date=data.start_date,
        end_date=data.end_date,
        is_current=data.is_current,
    )
    db.add(y)
    await db.commit()
    await db.refresh(y)
    return y


async def _clear_current_year(db, school_id):
    rows = (
        await db.execute(
            select(AcademicYear).where(
                AcademicYear.school_id == school_id, AcademicYear.is_current.is_(True)
            )
        )
    ).scalars().all()
    for y in rows:
        y.is_current = False


async def update_academic_year(db, school_id, year_id, data: AcademicYearUpdate) -> AcademicYear:
    y = await _get_year(db, school_id, year_id)
    if data.is_current and not y.is_current:
        await _clear_current_year(db, school_id)
    y.name, y.start_date, y.end_date, y.is_current = (
        data.name,
        data.start_date,
        data.end_date,
        data.is_current,
    )
    await db.commit()
    return y


async def delete_academic_year(db, school_id, year_id) -> None:
    y = await _get_year(db, school_id, year_id)
    await db.delete(y)
    await db.commit()


# ---- School periods ----
async def list_school_periods(db: AsyncSession, school_id: int) -> list[dict]:
    year_ids = (
        await db.execute(select(AcademicYear.id).where(AcademicYear.school_id == school_id))
    ).scalars().all()
    if not year_ids:
        return []
    rows = (
        await db.execute(
            select(SchoolPeriod)
            .where(SchoolPeriod.academic_year_id.in_(year_ids))
            .order_by(SchoolPeriod.start_date)
        )
    ).scalars().all()
    return [
        {
            "id": p.id,
            "name": p.name,
            "period_type": p.period_type,
            "start_date": _iso(p.start_date),
            "end_date": _iso(p.end_date),
            "is_active": p.is_active,
            "academic_year_id": p.academic_year_id,
            "target_grades": p.target_grades,
        }
        for p in rows
    ]


async def _get_period(db, school_id, period_id) -> SchoolPeriod:
    p = await db.get(SchoolPeriod, period_id)
    if p is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Период не найден")
    # ensure the period's year belongs to this school
    if p.academic_year_id is not None:
        y = await db.get(AcademicYear, p.academic_year_id)
        if y is None or y.school_id != school_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Период не найден")
    return p


async def create_school_period(db, school_id, data: SchoolPeriodCreate) -> SchoolPeriod:
    p = SchoolPeriod(
        academic_year_id=data.academic_year_id,
        name=data.name,
        period_type=data.period_type,
        start_date=data.start_date,
        end_date=data.end_date,
        is_active=data.is_active,
        target_grades=data.target_grades,
    )
    db.add(p)
    await db.commit()
    await db.refresh(p)
    return p


async def update_school_period(db, school_id, period_id, data: SchoolPeriodUpdate) -> SchoolPeriod:
    p = await _get_period(db, school_id, period_id)
    p.academic_year_id = data.academic_year_id
    p.name = data.name
    p.period_type = data.period_type
    p.start_date = data.start_date
    p.end_date = data.end_date
    p.is_active = data.is_active
    p.target_grades = data.target_grades
    await db.commit()
    return p


async def delete_school_period(db, school_id, period_id) -> None:
    p = await _get_period(db, school_id, period_id)
    await db.delete(p)
    await db.commit()


# ---- Bell schedules ----
async def list_bell_schedules(db: AsyncSession, school_id: int) -> list[dict]:
    rows = (
        await db.execute(
            select(BellSchedule).where(BellSchedule.school_id == school_id).order_by(BellSchedule.id)
        )
    ).scalars().all()
    out = []
    for bs in rows:
        items = (
            await db.execute(
                select(BellScheduleItem)
                .where(BellScheduleItem.bell_schedule_id == bs.id)
                .order_by(BellScheduleItem.is_saturday, BellScheduleItem.lesson_number)
            )
        ).scalars().all()
        count = await db.scalar(
            select(func.count()).select_from(Class).where(Class.bell_schedule_id == bs.id)
        )
        out.append(
            {
                "id": bs.id,
                "name": bs.name,
                "classes_count": int(count or 0),
                "items": [
                    {
                        "lesson_number": i.lesson_number,
                        "start_time": i.start_time,
                        "end_time": i.end_time,
                        "is_saturday": i.is_saturday,
                    }
                    for i in items
                ],
            }
        )
    return out


async def _get_bell(db, school_id, bs_id) -> BellSchedule:
    bs = (
        await db.execute(
            select(BellSchedule).where(BellSchedule.id == bs_id, BellSchedule.school_id == school_id)
        )
    ).scalar_one_or_none()
    if bs is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Расписание звонков не найдено")
    return bs


async def _replace_items(db, bs_id, items) -> None:
    existing = (
        await db.execute(select(BellScheduleItem).where(BellScheduleItem.bell_schedule_id == bs_id))
    ).scalars().all()
    for it in existing:
        await db.delete(it)
    for it in items:
        db.add(
            BellScheduleItem(
                bell_schedule_id=bs_id,
                lesson_number=it.lesson_number,
                start_time=it.start_time,
                end_time=it.end_time,
                is_saturday=it.is_saturday,
            )
        )


async def create_bell_schedule(db, school_id, data: BellScheduleCreate) -> BellSchedule:
    bs = BellSchedule(school_id=school_id, name=data.name)
    db.add(bs)
    await db.flush()
    await _replace_items(db, bs.id, data.items)
    await db.commit()
    await db.refresh(bs)
    return bs


async def update_bell_schedule(db, school_id, bs_id, data: BellScheduleUpdate) -> BellSchedule:
    bs = await _get_bell(db, school_id, bs_id)
    bs.name = data.name
    await _replace_items(db, bs.id, data.items)
    await db.commit()
    return bs


async def delete_bell_schedule(db, school_id, bs_id) -> None:
    bs = await _get_bell(db, school_id, bs_id)
    await db.delete(bs)
    await db.commit()
