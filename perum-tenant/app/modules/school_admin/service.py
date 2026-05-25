"""School-admin academic-core logic (Phase 5): subjects, work types, dashboard.

Scoped to a school via `school_id`. org_admin (school_id=NULL) is resolved to
the org's school (one for now); multi-school selection is a later refinement.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import School, Subject, User, WorkType
from app.models.academic import Class
from app.models.journal import ControlWork, Grade, Homework
from app.modules.school_admin.schemas import (
    SubjectCreate,
    SubjectUpdate,
    WorkTypeCreate,
    WorkTypeUpdate,
)


async def resolve_school_id(user: User, db: AsyncSession) -> int:
    if user.school_id is not None:
        return user.school_id
    result = await db.execute(select(School.id).order_by(School.id).limit(1))
    school_id = result.scalar_one_or_none()
    if school_id is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "В организации ещё нет школы")
    return school_id


# ---- Subjects ------------------------------------------------------------

def _subject_dict(s: Subject) -> dict:
    return {
        "id": s.id,
        "name": s.name,
        "short_name": s.short_name,
        "category": s.category,
        "in_exchange": s.in_exchange,
        "exchange_coefficient": s.exchange_coefficient,
        "profile_weight": s.profile_weight,
        "is_profile_track": s.is_profile_track,
        "teacher_count": 0,  # filled when teacher assignments land
        "assignments": [],
        "created_at": s.created_at.isoformat() if s.created_at else None,
    }


async def list_subjects(db: AsyncSession, school_id: int) -> list[dict]:
    result = await db.execute(
        select(Subject).where(Subject.school_id == school_id).order_by(Subject.name)
    )
    return [_subject_dict(s) for s in result.scalars().all()]


async def _get_subject(db: AsyncSession, school_id: int, subject_id: int) -> Subject:
    result = await db.execute(
        select(Subject).where(Subject.id == subject_id, Subject.school_id == school_id)
    )
    subject = result.scalar_one_or_none()
    if subject is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Предмет не найден")
    return subject


async def create_subject(db: AsyncSession, school_id: int, data: SubjectCreate) -> Subject:
    subject = Subject(school_id=school_id, **data.model_dump())
    db.add(subject)
    await db.commit()
    await db.refresh(subject)
    return subject


async def update_subject(
    db: AsyncSession, school_id: int, subject_id: int, data: SubjectUpdate
) -> Subject:
    subject = await _get_subject(db, school_id, subject_id)
    for field, value in data.model_dump().items():
        setattr(subject, field, value)
    await db.commit()
    await db.refresh(subject)
    return subject


async def delete_subject(db: AsyncSession, school_id: int, subject_id: int) -> None:
    subject = await _get_subject(db, school_id, subject_id)
    await db.delete(subject)
    await db.commit()


# ---- Work types ----------------------------------------------------------

def _work_type_dict(w: WorkType) -> dict:
    return {"id": w.id, "name": w.name, "weight": w.weight, "is_active": w.is_active}


async def list_work_types(db: AsyncSession, school_id: int) -> list[dict]:
    result = await db.execute(
        select(WorkType).where(WorkType.school_id == school_id).order_by(WorkType.id)
    )
    return [_work_type_dict(w) for w in result.scalars().all()]


async def _get_work_type(db: AsyncSession, school_id: int, work_type_id: int) -> WorkType:
    result = await db.execute(
        select(WorkType).where(WorkType.id == work_type_id, WorkType.school_id == school_id)
    )
    wt = result.scalar_one_or_none()
    if wt is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Вид работы не найден")
    return wt


async def create_work_type(db: AsyncSession, school_id: int, data: WorkTypeCreate) -> WorkType:
    wt = WorkType(school_id=school_id, **data.model_dump())
    db.add(wt)
    await db.commit()
    await db.refresh(wt)
    return wt


async def update_work_type(
    db: AsyncSession, school_id: int, work_type_id: int, data: WorkTypeUpdate
) -> WorkType:
    wt = await _get_work_type(db, school_id, work_type_id)
    for field, value in data.model_dump().items():
        setattr(wt, field, value)
    await db.commit()
    await db.refresh(wt)
    return wt


async def delete_work_type(db: AsyncSession, school_id: int, work_type_id: int) -> None:
    wt = await _get_work_type(db, school_id, work_type_id)
    await db.delete(wt)
    await db.commit()


# ---- Dashboard overview --------------------------------------------------

async def dashboard_overview(db: AsyncSession, school_id: int, period_days: int) -> dict:
    """Педагогический обзор школы за период: KPI, успеваемость по классам,
    распределение оценок, посещаемость, отстающие, активность учителей,
    ДЗ/контрольные, дневной график среднего балла."""
    gv = Grade.grade_value
    period_start = datetime.now() - timedelta(days=period_days)
    base = (Grade.school_id == school_id, gv.is_not(None), Grade.created_at >= period_start)

    total_students = await db.scalar(
        select(func.count()).select_from(User).where(User.school_id == school_id, User.role == "student")
    )
    total_grades = await db.scalar(select(func.count()).select_from(Grade).where(*base))
    avg = await db.scalar(select(func.avg(gv)).where(*base))
    average_grade = round(float(avg), 2) if avg is not None else 0

    # Распределение 5/4/3/2
    dist_rows = (await db.execute(select(gv, func.count()).where(*base).group_by(gv))).all()
    dist_map = {int(v): int(c) for v, c in dist_rows}
    grade_distribution = [{"grade_value": v, "count": dist_map.get(v, 0)} for v in (5, 4, 3, 2)]

    # Средний балл по классам
    cp_rows = (
        await db.execute(select(Grade.class_id, func.avg(gv), func.count()).where(*base).group_by(Grade.class_id))
    ).all()
    class_performance = []
    for cid, cavg, ccount in cp_rows:
        c = await db.get(Class, cid)
        class_performance.append({
            "class_id": cid,
            "class_name": c.name if c else str(cid),
            "grade_level": c.grade_level if c else None,
            "avg_grade": round(float(cavg), 2),
            "grades_count": int(ccount),
        })
    class_performance.sort(key=lambda x: x["avg_grade"], reverse=True)

    # Посещаемость (attendance_mark): УП/НП/осв.
    att_rows = (
        await db.execute(
            select(Grade.attendance_mark, func.count())
            .where(Grade.school_id == school_id, Grade.attendance_mark.is_not(None), Grade.created_at >= period_start)
            .group_by(Grade.attendance_mark)
        )
    ).all()
    attendance = [{"mark": m, "count": int(c)} for m, c in att_rows]
    total_absences = sum(a["count"] for a in attendance if a["mark"] in ("УП", "НП"))

    # Отстающие: avg<3 при ≥3 оценках
    failing_rows = (
        await db.execute(
            select(
                User.id, User.first_name, User.last_name,
                func.avg(gv).label("avg"), func.count(Grade.id).label("cnt"), Class.name.label("class_name"),
            )
            .join(Grade, Grade.student_id == User.id)
            .join(Class, Grade.class_id == Class.id)
            .where(User.school_id == school_id, gv.is_not(None), Grade.created_at >= period_start, User.role == "student")
            .group_by(User.id, User.first_name, User.last_name, Class.name)
            .having(func.avg(gv) < 3.0)
            .having(func.count(Grade.id) >= 3)
            .order_by(func.avg(gv))
            .limit(20)
        )
    ).all()
    failing_students = [
        {
            "id": r.id,
            "name": f"{r.last_name or ''} {r.first_name or ''}".strip(),
            "avg": round(float(r.avg or 0), 2),
            "grades_count": int(r.cnt or 0),
            "class_name": r.class_name,
        }
        for r in failing_rows
    ]

    # Активность учителей: выставлено оценок за период
    teacher_rows = (
        await db.execute(
            select(User.id, User.first_name, User.last_name, func.count(Grade.id).label("cnt"))
            .join(Grade, Grade.teacher_id == User.id)
            .where(User.school_id == school_id, Grade.created_at >= period_start)
            .group_by(User.id, User.first_name, User.last_name)
            .order_by(func.count(Grade.id).desc())
            .limit(10)
        )
    ).all()
    teacher_activity = [
        {"id": r.id, "name": f"{r.last_name or ''} {r.first_name or ''}".strip(), "grades_given": int(r.cnt or 0)}
        for r in teacher_rows
    ]

    # ДЗ и контрольные за период
    hw_count = await db.scalar(
        select(func.count(Homework.id)).join(Class, Homework.class_id == Class.id)
        .where(Class.school_id == school_id, Homework.created_at >= period_start)
    ) or 0
    cw_count = await db.scalar(
        select(func.count(ControlWork.id)).join(Class, ControlWork.class_id == Class.id)
        .where(Class.school_id == school_id, ControlWork.created_at >= period_start)
    ) or 0

    # Дневной график среднего балла
    daily_rows = (await db.execute(select(Grade.created_at, gv).where(*base))).all()
    buckets: dict[str, list[int]] = {}
    for dt, val in daily_rows:
        key = dt.strftime("%d.%m")
        buckets.setdefault(key, [0, 0])
        buckets[key][0] += val
        buckets[key][1] += 1
    daily_avg = [
        {"date": k, "avg_grade": round(v[0] / v[1], 2) if v[1] else 0} for k, v in buckets.items()
    ]

    return {
        "success": True,
        "kpi": {
            "average_grade": average_grade,
            "total_grades": int(total_grades or 0),
            "total_students": int(total_students or 0),
            "failing_count": len(failing_students),
            "absences": int(total_absences),
            "homework_count": int(hw_count),
            "control_work_count": int(cw_count),
        },
        "class_performance": class_performance,
        "grade_distribution": grade_distribution,
        "attendance": attendance,
        "failing_students": failing_students,
        "teacher_activity": teacher_activity,
        "daily_avg": daily_avg,
    }
