"""Journal / grades logic (Phase 6), ported from the legacy journal_service.

Grading awards livki via points_calculator, updates the student's balance
atomically (floored at 0) and writes a Transaction ledger row.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta

from fastapi import HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time import utc_now
from app.models import User
from app.models.academic import (
    AcademicYear,
    Class,
    ClassStudent,
    LessonOccurrence,
    Schedule,
    SchoolPeriod,
    Subject,
    TeacherSubject,
    Topic,
    WorkType,
)
from app.models.journal import FinalGrade, Grade, LessonTemplate, Transaction
from app.modules.journal.schemas import AddGradeRequest, FinalGradeRequest, LessonOccurrenceUpdate, LessonTemplateUpdate, UpdateGradeRequest
from app.modules.academic.occurrences import get_or_create_occurrence
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
    subject = await db.get(Subject, subject_id)
    if subject is None or subject.school_id != school_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Предмет не найден")
    rows = (
        await db.execute(
            select(Topic).where(
                Topic.school_id == school_id, Topic.subject_id == subject_id
            ).order_by(Topic.order_num)
        )
    ).scalars().all()
    return [{"id": t.id, "name": t.name, "order_num": t.order_num} for t in rows]


async def _can_mutate_subject(db: AsyncSession, user: User, subject_id: int) -> bool:
    if _is_admin(user):
        return True
    return await db.scalar(select(TeacherSubject.id).where(
        TeacherSubject.teacher_id == user.id, TeacherSubject.subject_id == subject_id,
    )) is not None


async def create_topic(
    db: AsyncSession, school_id: int, subject_id: int, name: str, user: User
) -> dict:
    subject = await db.get(Subject, subject_id)
    if subject is None or subject.school_id != school_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Предмет не найден")
    if not await _can_mutate_subject(db, user, subject_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Нет назначения на этот предмет")
    max_order = await db.scalar(
        select(func.max(Topic.order_num)).where(Topic.subject_id == subject_id)
    ) or 0
    topic = Topic(school_id=school_id, subject_id=subject_id, name=name, order_num=max_order + 1)
    db.add(topic)
    await db.commit()
    await db.refresh(topic)
    return {"id": topic.id, "name": topic.name, "order_num": topic.order_num}


async def update_topic(
    db: AsyncSession, school_id: int, topic_id: int, name: str, user: User
) -> dict:
    topic = await db.get(Topic, topic_id)
    if not topic or topic.school_id != school_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "topic not found")
    if not await _can_mutate_subject(db, user, topic.subject_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Нет назначения на этот предмет")
    topic.name = name
    await db.commit()
    await db.refresh(topic)
    return {"id": topic.id, "name": topic.name, "order_num": topic.order_num}


async def delete_topic(db: AsyncSession, school_id: int, topic_id: int, user: User) -> dict:
    topic = await db.get(Topic, topic_id)
    if not topic or topic.school_id != school_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "topic not found")
    if not await _can_mutate_subject(db, user, topic.subject_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Нет назначения на этот предмет")
    if await db.scalar(select(Grade.id).where(Grade.topic_id == topic_id).limit(1)) or await db.scalar(
        select(LessonTemplate.id).where(LessonTemplate.topic_id == topic_id).limit(1)
    ):
        raise HTTPException(status.HTTP_409_CONFLICT, "Нельзя удалить используемую тему")
    await db.delete(topic)
    await db.commit()
    return {"detail": "ok"}


def _parse_lesson_date(value: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Неверная дата урока")


def _scheduled_lesson_dates(period_start: date, period_end: date, weekdays: list[int]) -> set[str]:
    dates: set[str] = set()
    for weekday in weekdays:
        lesson_day = period_start + timedelta(days=(weekday - period_start.weekday()) % 7)
        while lesson_day <= period_end:
            dates.add(lesson_day.isoformat())
            lesson_day += timedelta(days=7)
    return dates


async def _validate_template_values(
    db: AsyncSession, school_id: int, subject_id: int, payload: LessonTemplateUpdate
) -> None:
    if payload.topic_id is not None:
        topic = await db.get(Topic, payload.topic_id)
        if topic is None or topic.school_id != school_id or topic.subject_id != subject_id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Тема не относится к выбранному предмету")
    if payload.work_type_id is not None:
        work_type = await db.get(WorkType, payload.work_type_id)
        if work_type is None or work_type.school_id != school_id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Тип работы не найден")


async def set_lesson_template(
    db: AsyncSession,
    school_id: int,
    class_id: int,
    subject_id: int,
    lesson_date: str,
    payload: LessonTemplateUpdate,
    user: User,
) -> dict:
    await _get_class(db, school_id, class_id)
    subject = await db.get(Subject, subject_id)
    if subject is None or subject.school_id != school_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Предмет не найден")
    if not await _assigned(db, user, class_id, subject_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Нет доступа к этому журналу")
    await _validate_template_values(db, school_id, subject_id, payload)
    parsed_date = _parse_lesson_date(lesson_date)
    scheduled_rows = (await db.execute(select(Schedule).where(
        Schedule.school_id == school_id,
        Schedule.class_id == class_id,
        Schedule.subject_id == subject_id,
        Schedule.day_of_week == parsed_date.weekday(),
    ))).scalars().all()
    if not scheduled_rows:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "На выбранную дату урок не запланирован")
    if payload.lesson_number is None and len(scheduled_rows) > 1:
        raise HTTPException(status.HTTP_409_CONFLICT, "Укажите номер урока: предмет встречается несколько раз в этот день")
    lesson_number = payload.lesson_number or scheduled_rows[0].lesson_number
    occurrence = await get_or_create_occurrence(
        db, school_id, class_id, subject_id, parsed_date, lesson_number
    )
    template = (
        await db.execute(
            select(LessonTemplate).where(
                LessonTemplate.school_id == school_id,
                LessonTemplate.class_id == class_id,
                LessonTemplate.subject_id == subject_id,
                LessonTemplate.occurrence_id == occurrence.id,
            )
        )
    ).scalar_one_or_none()
    if template is None:
        template = LessonTemplate(
            school_id=school_id,
            class_id=class_id,
            subject_id=subject_id,
            lesson_date=parsed_date,
            occurrence_id=occurrence.id,
        )
        db.add(template)
    template.topic_id = payload.topic_id
    template.work_type_id = payload.work_type_id
    occurrence.topic_id = payload.topic_id
    occurrence.work_type_id = payload.work_type_id
    template.updated_by = user.id

    start = datetime.combine(parsed_date, time.min)
    end = start + timedelta(days=1)
    updated_grades = 0
    if payload.topic_id is not None:
        result = await db.execute(
            update(Grade)
            .where(
                Grade.school_id == school_id,
                Grade.class_id == class_id,
                Grade.subject_id == subject_id,
                Grade.occurrence_id == occurrence.id,
            )
            .values(topic_id=payload.topic_id)
        )
        updated_grades = result.rowcount
    await db.commit()
    return {"success": True, "updated_grades": updated_grades}


async def clear_lesson_template(
    db: AsyncSession,
    school_id: int,
    class_id: int,
    subject_id: int,
    lesson_date: str,
    lesson_number: int | None,
    user: User,
) -> dict:
    if not await _assigned(db, user, class_id, subject_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Нет доступа к этому журналу")
    parsed_date = _parse_lesson_date(lesson_date)
    occurrence = None
    if lesson_number is not None:
        occurrence = await db.scalar(select(LessonOccurrence).where(
            LessonOccurrence.school_id == school_id,
            LessonOccurrence.class_id == class_id,
            LessonOccurrence.subject_id == subject_id,
            LessonOccurrence.lesson_date == parsed_date,
            LessonOccurrence.lesson_number == lesson_number,
        ))
    template = (
        await db.execute(
            select(LessonTemplate).where(
                LessonTemplate.school_id == school_id,
                LessonTemplate.class_id == class_id,
                LessonTemplate.subject_id == subject_id,
                LessonTemplate.occurrence_id == occurrence.id if occurrence is not None else LessonTemplate.lesson_date == parsed_date,
            )
        )
    ).scalar_one_or_none()
    if template is not None:
        if template.occurrence_id is not None:
            occurrence = await db.get(LessonOccurrence, template.occurrence_id)
        if occurrence is not None:
            occurrence.topic_id = None
            occurrence.work_type_id = None
        await db.delete(template)
        await db.commit()
    return {"success": True}


async def update_lesson_occurrence(
    db: AsyncSession, school_id: int, occurrence_id: int,
    payload: LessonOccurrenceUpdate, user: User,
) -> dict:
    occurrence = await db.get(LessonOccurrence, occurrence_id)
    if occurrence is None or occurrence.school_id != school_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Урок не найден")
    if not await _assigned(db, user, occurrence.class_id, occurrence.subject_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Нет доступа к этому уроку")
    if payload.status is not None:
        if payload.status not in {"scheduled", "cancelled", "completed"}:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Недопустимый статус урока")
        occurrence.status = payload.status
    if payload.topic_id is not None:
        topic = await db.get(Topic, payload.topic_id)
        if topic is None or topic.school_id != school_id or topic.subject_id != occurrence.subject_id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Тема не относится к выбранному предмету")
        occurrence.topic_id = payload.topic_id
    await db.commit()
    return {"success": True, "occurrence_id": occurrence.id, "status": occurrence.status}


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
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Учебный период не найден")
    now = utc_now()
    for p in quarters:
        if p.start_date <= now <= p.end_date:
            return p
    past = [p for p in quarters if p.end_date < now]
    if past:
        return past[-1]
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
        period_end = datetime.combine(current.end_date.date() + timedelta(days=1), time.min)
        gq = gq.where(Grade.lesson_date >= current.start_date, Grade.lesson_date < period_end)
    grades = (await db.execute(gq)).scalars().all()

    tq = select(LessonTemplate).where(
        LessonTemplate.school_id == school_id,
        LessonTemplate.class_id == class_id,
        LessonTemplate.subject_id == subject_id,
    )
    if current is not None:
        tq = tq.where(
            LessonTemplate.lesson_date >= current.start_date.date(),
            LessonTemplate.lesson_date <= current.end_date.date(),
        )
    templates = (await db.execute(tq)).scalars().all()
    occurrence_ids = [t.occurrence_id for t in templates if t.occurrence_id is not None]
    occurrences = (
        await db.execute(select(LessonOccurrence).where(LessonOccurrence.id.in_(occurrence_ids)))
    ).scalars().all() if occurrence_ids else []

    schedule_rows = (
        await db.execute(
            select(Schedule.day_of_week, Schedule.lesson_number).where(
                Schedule.school_id == school_id,
                Schedule.class_id == class_id,
                Schedule.subject_id == subject_id,
            ).order_by(Schedule.day_of_week, Schedule.lesson_number)
        )
    ).all()
    schedule_days = sorted({row.day_of_week for row in schedule_rows})

    by_student: dict[int, list[Grade]] = {}
    dates: set[str] = set()
    for g in grades:
        by_student.setdefault(g.student_id, []).append(g)
        if g.lesson_date:
            dates.add(g.lesson_date.date().isoformat())
    if current is not None:
        dates.update(
            _scheduled_lesson_dates(
                current.start_date.date(), current.end_date.date(), list(schedule_days)
            )
        )
    dates.update(t.lesson_date.isoformat() for t in templates)

    topic_ids = {g.topic_id for g in grades if g.topic_id}
    topics_map: dict[int, str] = {}
    if topic_ids:
        topics_map = {
            t.id: t.name
            for t in (await db.execute(select(Topic).where(Topic.id.in_(topic_ids)))).scalars().all()
        }

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
                "topic_id": g.topic_id,
                "topic_name": topics_map.get(g.topic_id) if g.topic_id else None,
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
                FinalGrade.school_id == school_id,
                FinalGrade.class_id == class_id,
                FinalGrade.subject_id == subject_id,
                FinalGrade.period_id == current.id if current is not None else FinalGrade.id.is_(None),
            )
        )
    ).scalars().all()

    return {
        "subject": {"id": subject.id, "name": subject.name, "category": subject.category},
        "students": student_dicts,
        "dates": sorted(dates),
        "schedule_slots": {
            lesson_date: [
                row.lesson_number for row in schedule_rows
                if row.day_of_week == date.fromisoformat(lesson_date).weekday()
            ]
            for lesson_date in sorted(dates)
        },
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
        "lesson_templates": {
            str(t.occurrence_id or t.lesson_date.isoformat()): {
                "occurrence_id": t.occurrence_id,
                "lesson_date": t.lesson_date.isoformat(),
                "lesson_number": next((o.lesson_number for o in occurrences if o.id == t.occurrence_id), None),
                "topic_id": t.topic_id,
                "work_type_id": t.work_type_id,
            }
            for t in templates
        },
    }


async def set_final_grade(
    db: AsyncSession, school_id: int, class_id: int, subject_id: int,
    payload: FinalGradeRequest, user: User,
) -> dict:
    await _get_class(db, school_id, class_id)
    subject = await db.get(Subject, subject_id)
    if subject is None or subject.school_id != school_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Предмет не найден")
    if not await _assigned(db, user, class_id, subject_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Нет доступа к этому журналу")
    await _validate_student(db, school_id, class_id, payload.student_id)
    await db.scalar(select(ClassStudent.id).where(
        ClassStudent.class_id == class_id,
        ClassStudent.student_id == payload.student_id,
    ).with_for_update())
    _resolve_period(await _list_periods(db, school_id), payload.period_id)
    if payload.grade_value not in (1, 2, 3, 4, 5):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Оценка должна быть от 1 до 5")

    final = await db.scalar(
        select(FinalGrade).where(
            FinalGrade.school_id == school_id,
            FinalGrade.class_id == class_id,
            FinalGrade.subject_id == subject_id,
            FinalGrade.student_id == payload.student_id,
            FinalGrade.period_id == payload.period_id,
        ).with_for_update()
    )
    if final is None:
        final = FinalGrade(
            school_id=school_id, class_id=class_id, subject_id=subject_id,
            student_id=payload.student_id, period_id=payload.period_id,
        )
        db.add(final)
    final.teacher_id = user.id
    final.grade_value = payload.grade_value
    final.grade_type = payload.grade_type
    final.comment = payload.comment
    final.updated_at = utc_now()
    await db.commit()
    await db.refresh(final)
    return {"success": True, "final_grade_id": final.id}


async def delete_final_grade(
    db: AsyncSession, school_id: int, final_grade_id: int, user: User,
) -> dict:
    final = await db.get(FinalGrade, final_grade_id)
    if final is None or final.school_id != school_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Итоговая оценка не найдена")
    if not await _assigned(db, user, final.class_id, final.subject_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Нет доступа к этому журналу")
    await db.delete(final)
    await db.commit()
    return {"success": True}


# ---- grade mutations ----
async def _award(db: AsyncSession, student_id: int, points: int) -> tuple[int, int]:
    student = await db.scalar(select(User).where(User.id == student_id).with_for_update())
    if student is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ученик не найден")
    old_balance = student.balance
    student.balance = max(old_balance + points, 0)
    await db.flush()
    return student.balance, student.balance - old_balance


def _validate_grade_values(grade_value: int | None, attendance_mark: str | None) -> None:
    if grade_value is None and not attendance_mark:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Нужна оценка или пометка посещаемости")
    if grade_value is not None and grade_value not in (1, 2, 3, 4, 5):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Оценка должна быть от 1 до 5")
    if attendance_mark and attendance_mark not in VALID_ATTENDANCE:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Недопустимая пометка")


async def _validate_student(
    db: AsyncSession, school_id: int, class_id: int, student_id: int
) -> None:
    student = await db.get(User, student_id)
    if (
        student is None
        or student.school_id != school_id
        or student.role != "student"
        or not student.is_active
    ):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Ученик не найден или неактивен")
    membership = await db.scalar(
        select(ClassStudent.id).where(
            ClassStudent.class_id == class_id, ClassStudent.student_id == student_id
        )
    )
    if membership is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Ученик не состоит в выбранном классе")


async def _work_type_weight(db: AsyncSession, school_id: int, work_type_id: int | None) -> float:
    if work_type_id is None:
        return 1.0
    work_type = await db.get(WorkType, work_type_id)
    if work_type is None or work_type.school_id != school_id or not work_type.is_active:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Тип работы не найден или неактивен")
    return work_type.weight


async def add_grade(db: AsyncSession, school_id: int, payload: AddGradeRequest, user: User) -> dict:
    _validate_grade_values(payload.grade_value, payload.attendance_mark)
    if not await _assigned(db, user, payload.class_id, payload.subject_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Нет доступа к этому журналу")

    cls = await _get_class(db, school_id, payload.class_id)
    subject = await db.get(Subject, payload.subject_id)
    if subject is None or subject.school_id != school_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Предмет не найден")
    await _validate_student(db, school_id, payload.class_id, payload.student_id)

    lesson_date = utc_now()
    if payload.lesson_date:
        try:
            lesson_date = datetime.fromisoformat(payload.lesson_date)
        except ValueError:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Неверная дата урока")

    occurrence = None
    if payload.lesson_number is not None:
        occurrence = await get_or_create_occurrence(
            db, school_id, payload.class_id, payload.subject_id,
            lesson_date.date(), payload.lesson_number,
        )

    topic_id = payload.topic_id
    work_type_id = payload.work_type_id
    template = (
        await db.execute(
            select(LessonTemplate).where(
                LessonTemplate.school_id == school_id,
                LessonTemplate.class_id == payload.class_id,
                LessonTemplate.subject_id == payload.subject_id,
                LessonTemplate.occurrence_id == occurrence.id if occurrence is not None else LessonTemplate.lesson_date == lesson_date.date(),
            )
        )
    ).scalar_one_or_none()
    if payload.topic_id is None and template is not None and template.topic_id is not None:
        topic_id = template.topic_id
    if payload.work_type_id is None and template is not None and template.work_type_id is not None:
        work_type_id = template.work_type_id
    if topic_id is not None:
        topic = await db.get(Topic, topic_id)
        if topic is None or topic.school_id != school_id or topic.subject_id != payload.subject_id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Тема не относится к выбранному предмету")

    weight = await _work_type_weight(db, school_id, work_type_id)
    points = calculate_points(
        payload.grade_value, subject.category, weight, subject.profile_weight,
        subject.is_profile_track, cls.is_profile == 1,
    )

    grade = Grade(
        school_id=school_id,
        student_id=payload.student_id,
        teacher_id=user.id,
        class_id=payload.class_id,
        subject_id=payload.subject_id,
        topic_id=topic_id,
        work_type_id=work_type_id,
        grade_value=payload.grade_value,
        weight=weight,
        value=points,
        attendance_mark=payload.attendance_mark,
        comment=payload.comment,
        lesson_date=lesson_date,
        occurrence_id=occurrence.id if occurrence else None,
    )
    db.add(grade)
    await db.flush()

    if points:
        new_balance, applied_points = await _award(db, payload.student_id, points)
    else:
        new_balance, applied_points = await _balance(db, payload.student_id), 0
    if applied_points:
        db.add(
            Transaction(
                school_id=school_id,
                user_id=payload.student_id,
                amount=applied_points,
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


async def get_grade(db: AsyncSession, school_id: int, grade_id: int, user: User) -> dict:
    g = await _get_grade(db, school_id, grade_id)
    if not await _assigned(db, user, g.class_id, g.subject_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Нет доступа к этой оценке")
    subject = await db.get(Subject, g.subject_id)
    student = await db.get(User, g.student_id)
    topic = await db.get(Topic, g.topic_id) if g.topic_id else None
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
        "topic_id": g.topic_id,
        "topic_name": topic.name if topic else None,
    }


async def update_grade(db: AsyncSession, school_id: int, grade_id: int, payload: UpdateGradeRequest, user: User) -> dict:
    g = await _get_grade(db, school_id, grade_id)
    if not await _assigned(db, user, g.class_id, g.subject_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Нет доступа к этой оценке")
    _validate_grade_values(payload.grade_value, payload.attendance_mark)
    await _validate_student(db, school_id, g.class_id, g.student_id)
    if payload.topic_id is not None:
        topic = await db.get(Topic, payload.topic_id)
        if topic is None or topic.school_id != school_id or topic.subject_id != g.subject_id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Тема не относится к выбранному предмету")
    subject = await db.get(Subject, g.subject_id)
    cls = await db.get(Class, g.class_id)

    weight = await _work_type_weight(db, school_id, payload.work_type_id)

    new_points = calculate_points(
        payload.grade_value, subject.category, weight, subject.profile_weight,
        subject.is_profile_track, cls.is_profile == 1,
    )
    diff = new_points - g.value

    g.grade_value = payload.grade_value
    g.work_type_id = payload.work_type_id
    g.attendance_mark = payload.attendance_mark
    g.comment = payload.comment
    g.topic_id = payload.topic_id
    g.weight = weight
    g.value = new_points
    await db.flush()

    if diff:
        new_balance, applied_diff = await _award(db, g.student_id, diff)
    else:
        new_balance, applied_diff = await _balance(db, g.student_id), 0
    if applied_diff:
        db.add(
            Transaction(
                school_id=school_id, user_id=g.student_id, amount=applied_diff, balance_after=new_balance,
                type="grade_correction", reason="Изменение оценки", related_id=g.id, created_by=user.id,
            )
        )
    await db.commit()
    return {
        "success": True,
        "grade_value": g.grade_value,
        "points": new_points,
        "points_diff": applied_diff,
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
        new_balance, applied_refund = await _award(db, student_id, refund)
        if applied_refund:
            db.add(
                Transaction(
                    school_id=school_id, user_id=student_id, amount=applied_refund, balance_after=new_balance,
                    type="grade_deleted", reason="Удаление оценки", related_id=grade_id, created_by=user.id,
                )
            )
    await db.commit()
    return {"success": True, "message": "Оценка удалена"}
