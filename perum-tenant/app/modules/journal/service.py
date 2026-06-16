"""Journal / grades logic (Phase 6), ported from the legacy journal_service.

Grading awards livki via points_calculator, updates the student's balance
atomically (floored at 0) and writes a Transaction ledger row.
"""

from __future__ import annotations

from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User
from app.models.academic import (
    AcademicYear,
    Class,
    ClassStudent,
    SchoolPeriod,
    Subject,
    TeacherSubject,
    Topic,
    WorkType,
)
from app.models.journal import FinalGrade, Grade, Transaction
from app.modules.journal.schemas import AddGradeRequest, UpdateGradeRequest
from app.services.points_calculator import calculate_points, grade_color

VALID_ATTENDANCE = {"УП", "НП", "осв.", "точка"}


def _is_admin(user: User) -> bool:
    # org_admin внутрь школы не заходит (его токен невалиден в стеке школы), поэтому
    # здесь его быть не должно. Убран как мёртвый код и латентный риск изоляции.
    return user.role in {"school_admin", "director"}


async def _get_class(db: AsyncSession, school_id: int, class_id: int) -> Class:
    c = (
        await db.execute(select(Class).where(Class.id == class_id, Class.school_id == school_id))
    ).scalar_one_or_none()
    if c is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Класс не найден")
    return c


async def _assigned(db: AsyncSession, user: User, class_id: int, subject_id: int) -> bool:
    if _is_admin(user):
        return True
    row = (
        await db.execute(
            select(TeacherSubject.id).where(
                TeacherSubject.teacher_id == user.id,
                TeacherSubject.class_id == class_id,
                TeacherSubject.subject_id == subject_id,
            )
        )
    ).scalar_one_or_none()
    return row is not None


# ---- pickers ----
async def teacher_subjects(db: AsyncSession, school_id: int, user: User) -> dict:
    """Classes + the subjects this teacher teaches in them (admins: everything)."""
    if _is_admin(user):
        classes = (
            await db.execute(select(Class).where(Class.school_id == school_id).order_by(Class.name))
        ).scalars().all()
        out = []
        for c in classes:
            subs = (
                await db.execute(
                    select(Subject)
                    .join(TeacherSubject, TeacherSubject.subject_id == Subject.id)
                    .where(TeacherSubject.class_id == c.id)
                    .distinct()
                )
            ).scalars().all()
            out.append(_class_with_subjects(c, subs))
        return {"classes": out}

    rows = (
        await db.execute(select(TeacherSubject).where(TeacherSubject.teacher_id == user.id))
    ).scalars().all()
    by_class: dict[int, list[int]] = {}
    for r in rows:
        by_class.setdefault(r.class_id, []).append(r.subject_id)
    out = []
    for class_id, subject_ids in by_class.items():
        c = await db.get(Class, class_id)
        if c is None or c.school_id != school_id:
            continue
        subs = [await db.get(Subject, sid) for sid in subject_ids]
        out.append(_class_with_subjects(c, [s for s in subs if s]))
    out.sort(key=lambda x: x["name"])
    return {"classes": out}


def _class_with_subjects(c: Class, subjects) -> dict:
    return {
        "id": c.id,
        "name": c.name,
        "grade_level": c.grade_level,
        "subjects": [
            {"id": s.id, "name": s.name, "short_name": s.short_name, "category": s.category}
            for s in subjects
        ],
    }


async def list_work_types(db: AsyncSession, school_id: int) -> list[dict]:
    rows = (
        await db.execute(
            select(WorkType).where(WorkType.school_id == school_id).order_by(WorkType.id)
        )
    ).scalars().all()
    return [{"id": w.id, "name": w.name, "weight": w.weight} for w in rows]


async def list_subjects(db: AsyncSession, school_id: int) -> list[dict]:
    rows = (
        await db.execute(
            select(Subject).where(Subject.school_id == school_id).order_by(Subject.name)
        )
    ).scalars().all()
    return [
        {"id": s.id, "name": s.name, "short_name": s.short_name, "category": s.category}
        for s in rows
    ]


async def list_topics(db: AsyncSession, school_id: int, subject_id: int) -> list[dict]:
    rows = (
        await db.execute(
            select(Topic).where(Topic.subject_id == subject_id).order_by(Topic.order_num)
        )
    ).scalars().all()
    return [{"id": t.id, "name": t.name, "order_num": t.order_num} for t in rows]


async def create_topic(db: AsyncSession, school_id: int, subject_id: int, name: str) -> dict:
    max_order = await db.scalar(
        select(func.max(Topic.order_num)).where(Topic.subject_id == subject_id)
    ) or 0
    topic = Topic(school_id=school_id, subject_id=subject_id, name=name, order_num=max_order + 1)
    db.add(topic)
    await db.commit()
    await db.refresh(topic)
    return {"id": topic.id, "name": topic.name, "order_num": topic.order_num}


async def update_topic(db: AsyncSession, topic_id: int, name: str) -> dict:
    topic = await db.get(Topic, topic_id)
    if not topic:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "topic not found")
    topic.name = name
    await db.commit()
    await db.refresh(topic)
    return {"id": topic.id, "name": topic.name, "order_num": topic.order_num}


async def delete_topic(db: AsyncSession, topic_id: int) -> dict:
    topic = await db.get(Topic, topic_id)
    if not topic:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "topic not found")
    await db.delete(topic)
    await db.commit()
    return {"detail": "ok"}


# ---- periods ----
async def _list_periods(db: AsyncSession, school_id: int) -> list[SchoolPeriod]:
    year_ids = (
        await db.execute(select(AcademicYear.id).where(AcademicYear.school_id == school_id))
    ).scalars().all()
    if not year_ids:
        return []
    return (
        await db.execute(
            select(SchoolPeriod)
            .where(SchoolPeriod.academic_year_id.in_(year_ids))
            .order_by(SchoolPeriod.start_date)
        )
    ).scalars().all()


def _resolve_period(periods: list[SchoolPeriod], period_id: int | None) -> SchoolPeriod | None:
    quarters = [p for p in periods if p.period_type == "quarter"] or periods
    if period_id:
        for p in periods:
            if p.id == period_id:
                return p
    now = datetime.utcnow()
    for p in quarters:
        if p.start_date <= now <= p.end_date:
            return p
    return quarters[0] if quarters else None


def _period_dict(p: SchoolPeriod) -> dict:
    return {
        "id": p.id,
        "name": p.name,
        "period_type": p.period_type,
        "target_grades": p.target_grades,
        "academic_year_id": p.academic_year_id,
        "start_date": p.start_date.date().isoformat() if p.start_date else None,
        "end_date": p.end_date.date().isoformat() if p.end_date else None,
    }


# ---- journal grid ----
async def get_journal(
    db: AsyncSession, school_id: int, class_id: int, subject_id: int, period_id: int | None, user: User
) -> dict:
    cls = await _get_class(db, school_id, class_id)
    subject = await db.get(Subject, subject_id)
    if subject is None or subject.school_id != school_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Предмет не найден")

    assigned = await _assigned(db, user, class_id, subject_id)
    readonly = not assigned and cls.teacher_id == user.id
    if not assigned and not readonly:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Нет доступа к этому журналу")

    students = (
        await db.execute(
            select(User)
            .join(ClassStudent, ClassStudent.student_id == User.id)
            .where(ClassStudent.class_id == class_id)
            .order_by(User.last_name, User.first_name)
        )
    ).scalars().all()

    periods = await _list_periods(db, school_id)
    current = _resolve_period(periods, period_id)

    gq = select(Grade).where(Grade.class_id == class_id, Grade.subject_id == subject_id)
    if current is not None:
        gq = gq.where(Grade.lesson_date >= current.start_date, Grade.lesson_date <= current.end_date)
    grades = (await db.execute(gq)).scalars().all()

    by_student: dict[int, list[Grade]] = {}
    dates: set[str] = set()
    for g in grades:
        by_student.setdefault(g.student_id, []).append(g)
        if g.lesson_date:
            dates.add(g.lesson_date.date().isoformat())

    student_dicts = []
    for s in students:
        glist = sorted(by_student.get(s.id, []), key=lambda g: (g.lesson_date or g.created_at))
        grade_dicts = [
            {
                "id": g.id,
                "grade_value": g.grade_value,
                "points": g.value,
                "grade_type": "",
                "work_type_id": g.work_type_id,
                "weight": g.weight,
                "attendance_mark": g.attendance_mark,
                "lesson_date": g.lesson_date.date().isoformat() if g.lesson_date else None,
                "comment": g.comment,
                "color": grade_color(g.grade_value, g.attendance_mark),
            }
            for g in glist
        ]
        num = sum((g.grade_value or 0) * g.weight for g in glist if g.grade_value)
        den = sum(g.weight for g in glist if g.grade_value)
        avg = round(num / den, 2) if den else None
        student_dicts.append(
            {
                "id": s.id,
                "first_name": s.first_name,
                "last_name": s.last_name,
                "patronymic": None,
                "grades": grade_dicts,
                "average": avg,
            }
        )

    finals = (
        await db.execute(
            select(FinalGrade).where(
                FinalGrade.class_id == class_id, FinalGrade.subject_id == subject_id
            )
        )
    ).scalars().all()

    return {
        "subject": {"id": subject.id, "name": subject.name, "category": subject.category},
        "students": student_dicts,
        "dates": sorted(dates),
        "current_period": _period_dict(current) if current else None,
        "available_periods": [_period_dict(p) for p in periods],
        "final_grades": [
            {
                "id": f.id,
                "student_id": f.student_id,
                "subject_id": f.subject_id,
                "period_id": f.period_id,
                "grade_value": f.grade_value,
                "grade_type": f.grade_type,
                "comment": f.comment,
            }
            for f in finals
        ],
        "control_works": [],
        "can_set_final_grade": current is not None and not readonly,
        "holiday_periods": [],
        "readonly": readonly,
        "subgroup_name": None,
    }


# ---- grade mutations ----
async def _award(db: AsyncSession, student_id: int, points: int) -> int:
    res = await db.execute(
        update(User)
        .where(User.id == student_id)
        .values(balance=func.greatest(User.balance + points, 0))
        .returning(User.balance)
    )
    return int(res.scalar_one())


async def add_grade(db: AsyncSession, school_id: int, payload: AddGradeRequest, user: User) -> dict:
    if payload.grade_value is None and not payload.attendance_mark:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Нужна оценка или пометка посещаемости")
    if payload.grade_value is not None and payload.grade_value not in (1, 2, 3, 4, 5):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Оценка должна быть от 1 до 5")
    if payload.attendance_mark and payload.attendance_mark not in VALID_ATTENDANCE:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Недопустимая пометка")
    if not await _assigned(db, user, payload.class_id, payload.subject_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Нет доступа к этому журналу")

    cls = await _get_class(db, school_id, payload.class_id)
    subject = await db.get(Subject, payload.subject_id)
    if subject is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Предмет не найден")

    weight = 1.0
    if payload.work_type_id:
        wt = await db.get(WorkType, payload.work_type_id)
        if wt is not None:
            weight = wt.weight

    points = calculate_points(
        payload.grade_value,
        subject.category,
        weight,
        subject.profile_weight,
        subject.is_profile_track,
        cls.is_profile == 1,
    )

    lesson_date = datetime.utcnow()
    if payload.lesson_date:
        try:
            lesson_date = datetime.fromisoformat(payload.lesson_date)
        except ValueError:
            pass

    grade = Grade(
        school_id=school_id,
        student_id=payload.student_id,
        teacher_id=user.id,
        class_id=payload.class_id,
        subject_id=payload.subject_id,
        topic_id=payload.topic_id,
        work_type_id=payload.work_type_id,
        grade_value=payload.grade_value,
        weight=weight,
        value=points,
        attendance_mark=payload.attendance_mark,
        comment=payload.comment,
        lesson_date=lesson_date,
    )
    db.add(grade)
    await db.flush()

    new_balance = await _award(db, payload.student_id, points) if points else await _balance(db, payload.student_id)
    if points:
        db.add(
            Transaction(
                school_id=school_id,
                user_id=payload.student_id,
                amount=points,
                balance_after=new_balance,
                type="grade",
                reason=f"Оценка {payload.grade_value} по «{subject.name}»",
                related_id=grade.id,
                created_by=user.id,
            )
        )
    await db.commit()

    message = (
        f"Оценка {payload.grade_value} выставлена ({'+' if points >= 0 else ''}{points} ливок)"
        if payload.grade_value is not None
        else "Пометка выставлена"
    )
    return {
        "success": True,
        "grade_id": grade.id,
        "grade_value": payload.grade_value,
        "points": points,
        "new_balance": new_balance,
        "color": grade_color(payload.grade_value, payload.attendance_mark),
        "attendance_mark": payload.attendance_mark,
        "message": message,
    }


async def _balance(db: AsyncSession, student_id: int) -> int:
    return int(await db.scalar(select(User.balance).where(User.id == student_id)) or 0)


async def _get_grade(db: AsyncSession, school_id: int, grade_id: int) -> Grade:
    g = (
        await db.execute(select(Grade).where(Grade.id == grade_id, Grade.school_id == school_id))
    ).scalar_one_or_none()
    if g is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Оценка не найдена")
    return g


async def get_grade(db: AsyncSession, school_id: int, grade_id: int) -> dict:
    g = await _get_grade(db, school_id, grade_id)
    subject = await db.get(Subject, g.subject_id)
    student = await db.get(User, g.student_id)
    return {
        "id": g.id,
        "grade_value": g.grade_value,
        "points": g.value,
        "grade_type": "",
        "work_type_id": g.work_type_id,
        "weight": g.weight,
        "lesson_date": g.lesson_date.date().isoformat() if g.lesson_date else None,
        "comment": g.comment,
        "attendance_mark": g.attendance_mark,
        "color": grade_color(g.grade_value, g.attendance_mark),
        "created_at": g.created_at.isoformat() if g.created_at else None,
        "subject": {"id": subject.id, "name": subject.name, "category": subject.category} if subject else None,
        "student": {"id": student.id, "first_name": student.first_name, "last_name": student.last_name} if student else None,
    }


async def update_grade(db: AsyncSession, school_id: int, grade_id: int, payload: UpdateGradeRequest, user: User) -> dict:
    g = await _get_grade(db, school_id, grade_id)
    if not await _assigned(db, user, g.class_id, g.subject_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Нет доступа к этой оценке")
    subject = await db.get(Subject, g.subject_id)
    cls = await db.get(Class, g.class_id)

    weight = g.weight
    if payload.work_type_id is not None:
        wt = await db.get(WorkType, payload.work_type_id)
        weight = wt.weight if wt else 1.0

    new_points = calculate_points(
        payload.grade_value, subject.category, weight, subject.profile_weight,
        subject.is_profile_track, cls.is_profile == 1,
    )
    diff = new_points - g.value

    g.grade_value = payload.grade_value
    g.work_type_id = payload.work_type_id
    g.attendance_mark = payload.attendance_mark
    g.comment = payload.comment
    g.weight = weight
    g.value = new_points
    await db.flush()

    new_balance = await _award(db, g.student_id, diff) if diff else await _balance(db, g.student_id)
    if diff:
        db.add(
            Transaction(
                school_id=school_id, user_id=g.student_id, amount=diff, balance_after=new_balance,
                type="grade_correction", reason="Изменение оценки", related_id=g.id, created_by=user.id,
            )
        )
    await db.commit()
    return {
        "success": True,
        "grade_value": g.grade_value,
        "points": new_points,
        "points_diff": diff,
        "new_balance": new_balance,
        "color": grade_color(g.grade_value, g.attendance_mark),
    }


async def delete_grade(db: AsyncSession, school_id: int, grade_id: int, user: User) -> dict:
    g = await _get_grade(db, school_id, grade_id)
    if not await _assigned(db, user, g.class_id, g.subject_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Нет доступа к этой оценке")
    refund = -g.value
    student_id = g.student_id
    await db.delete(g)
    await db.flush()
    if refund:
        new_balance = await _award(db, student_id, refund)
        db.add(
            Transaction(
                school_id=school_id, user_id=student_id, amount=refund, balance_after=new_balance,
                type="grade_deleted", reason="Удаление оценки", related_id=grade_id, created_by=user.id,
            )
        )
    await db.commit()
    return {"success": True, "message": "Оценка удалена"}
