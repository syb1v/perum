"""Teacher-facing data: own classes, subjects, class rosters."""

from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User
from app.models.academic import (
    BellScheduleItem,
    Class,
    ClassStudent,
    Schedule,
    Subject,
    TeacherSubject,
)
from app.models.journal import ControlWork, Grade, Homework


def _as_date(value):
    return value.date() if isinstance(value, datetime) else value


def _is_admin(user: User) -> bool:
    return user.role in {"school_admin", "director"}


async def teacher_classes(db: AsyncSession, school_id: int, user: User) -> list[dict]:
    if _is_admin(user):
        classes = (
            await db.execute(select(Class).where(Class.school_id == school_id).order_by(Class.name))
        ).scalars().all()
    else:
        ts_class_ids = set(
            (
                await db.execute(
                    select(TeacherSubject.class_id).where(TeacherSubject.teacher_id == user.id)
                )
            ).scalars().all()
        )
        homeroom_ids = set(
            (
                await db.execute(
                    select(Class.id).where(
                        Class.school_id == school_id, Class.teacher_id == user.id
                    )
                )
            ).scalars().all()
        )
        ids = ts_class_ids | homeroom_ids
        classes = (
            await db.execute(select(Class).where(Class.id.in_(ids)).order_by(Class.name))
        ).scalars().all() if ids else []
    out = []
    for c in classes:
        count = await db.scalar(
            select(func.count()).select_from(ClassStudent).where(ClassStudent.class_id == c.id)
        )
        out.append(
            {
                "id": c.id,
                "name": c.name,
                "student_count": int(count or 0),
                "created_at": c.created_at.isoformat() if c.created_at else None,
            }
        )
    return out


async def teacher_subjects(db: AsyncSession, school_id: int, user: User) -> list[dict]:
    if _is_admin(user):
        rows = (
            await db.execute(select(Subject).where(Subject.school_id == school_id).order_by(Subject.name))
        ).scalars().all()
    else:
        rows = (
            await db.execute(
                select(Subject)
                .join(TeacherSubject, TeacherSubject.subject_id == Subject.id)
                .where(TeacherSubject.teacher_id == user.id)
                .distinct()
            )
        ).scalars().all()
    return [
        {"id": s.id, "name": s.name, "short_name": s.short_name, "category": s.category}
        for s in rows
    ]


async def class_students(db: AsyncSession, school_id: int, class_id: int) -> list[dict]:
    rows = (
        await db.execute(
            select(User)
            .join(ClassStudent, ClassStudent.student_id == User.id)
            .where(ClassStudent.class_id == class_id)
            .order_by(User.last_name, User.first_name)
        )
    ).scalars().all()
    return [
        {
            "id": u.id,
            "login": u.login,
            "first_name": u.first_name,
            "last_name": u.last_name,
            "patronymic": None,
            "balance": u.balance,
            "is_online": False,
        }
        for u in rows
    ]


async def teacher_diary(db: AsyncSession, school_id: int, user: User, week_offset: int = 0) -> dict:
    """Build the teacher's weekly schedule across all classes they teach."""

    # Classes this teacher teaches (or all if admin)
    if _is_admin(user):
        ts_rows = (
            await db.execute(
                select(TeacherSubject).where(TeacherSubject.school_id == school_id)
            )
        ).scalars().all()
        teacher_classes_all = (
            await db.execute(select(Class).where(Class.school_id == school_id))
        ).scalars().all()
    else:
        ts_rows = (
            await db.execute(
                select(TeacherSubject).where(TeacherSubject.teacher_id == user.id)
            )
        ).scalars().all()
        class_ids = {t.class_id for t in ts_rows}
        teacher_classes_all = (
            await db.execute(select(Class).where(Class.id.in_(class_ids)))
        ).scalars().all() if class_ids else []

    today = datetime.now().date()
    week_start = today - timedelta(days=today.weekday()) + timedelta(weeks=week_offset)
    week_end = week_start + timedelta(days=6)

    class_by_id = {c.id: c for c in teacher_classes_all}

    # Schedule for all classes this teacher works with
    all_schedule = []
    if teacher_classes_all:
        class_ids = [c.id for c in teacher_classes_all]
        all_schedule = (
            await db.execute(
                select(Schedule)
                .where(Schedule.class_id.in_(class_ids), Schedule.school_id == school_id)
                .where(Schedule.teacher_id == user.id if not _is_admin(user) else True)
            )
        ).scalars().all()

    # Bell schedules by class
    bell_map: dict[int, list[BellScheduleItem]] = {}
    for c in teacher_classes_all:
        if c.bell_schedule_id:
            bell_map[c.id] = (
                await db.execute(
                    select(BellScheduleItem).where(BellScheduleItem.bell_schedule_id == c.bell_schedule_id)
                )
            ).scalars().all()

    # Subject names
    subj_ids = {s.subject_id for s in all_schedule}
    subj_map = {}
    if subj_ids:
        subjects = (await db.execute(select(Subject).where(Subject.id.in_(subj_ids)))).scalars().all()
        subj_map = {s.id: s for s in subjects}

    # Homework per (class_id, subject_id)
    hw_map: dict[tuple[int, int], list] = {}
    if teacher_classes_all:
        all_hw = (
            await db.execute(
                select(Homework).where(
                    Homework.class_id.in_(class_ids),
                    Homework.school_id == school_id,
                )
            )
        ).scalars().all()
        for h in all_hw:
            hw_map.setdefault((h.class_id, h.subject_id), []).append({
                "id": h.id,
                "title": h.title,
                "description": h.description,
            })

    # Control works for the week
    cw_map: dict[tuple[int, int, str], dict] = {}
    if teacher_classes_all:
        week_start_dt = datetime(week_start.year, week_start.month, week_start.day)
        week_end_dt = datetime(week_end.year, week_end.month, week_end.day, 23, 59, 59)
        cws = (
            await db.execute(
                select(ControlWork).where(
                    ControlWork.class_id.in_(class_ids),
                    ControlWork.school_id == school_id,
                    ControlWork.work_date >= week_start_dt,
                    ControlWork.work_date <= week_end_dt,
                )
            )
        ).scalars().all()
        for cw in cws:
            if cw.work_date:
                cw_map[(cw.class_id, cw.subject_id, cw.work_date.strftime("%Y-%m-%d"))] = {
                    "id": cw.id,
                    "work_type": cw.work_type,
                    "title": cw.title,
                }

    DAY_NAMES = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"]

    diary: dict[str, dict] = {}
    for day in range(6):
        day_date = week_start + timedelta(days=day)
        date_str = day_date.strftime("%Y-%m-%d")
        is_saturday = day == 5

        lessons = []
        for item in sorted(
            (s for s in all_schedule if s.day_of_week == day), key=lambda s: s.lesson_number
        ):
            cls = class_by_id.get(item.class_id)
            bell = None
            if cls and cls.bell_schedule_id:
                for b in bell_map.get(cls.id, []):
                    if b.lesson_number == item.lesson_number and bool(b.is_saturday) == is_saturday:
                        bell = b
                        break
            subj = subj_map.get(item.subject_id)
            cw_key = (item.class_id, item.subject_id, date_str)
            lessons.append({
                "lesson_number": item.lesson_number,
                "subject_id": item.subject_id,
                "subject_name": subj.name if subj else None,
                "class_id": item.class_id,
                "class_name": cls.name if cls else None,
                "room": item.room,
                "start_time": bell.start_time if bell else "08:00",
                "end_time": bell.end_time if bell else "08:45",
                "homework": hw_map.get((item.class_id, item.subject_id), []),
                "control_work": cw_map.get(cw_key),
            })

        diary[str(day)] = {
            "date": date_str,
            "day_name": DAY_NAMES[day],
            "is_today": day_date == today,
            "lessons": lessons,
        }

    return {
        "teacher_id": user.id,
        "teacher_name": f"{user.last_name or ''} {user.first_name or ''}".strip(),
        "week_start": week_start.isoformat(),
        "week_end": week_end.isoformat(),
        "week_offset": week_offset,
        "diary": diary,
    }


async def my_class(db: AsyncSession, school_id: int, user: User) -> dict:
    """Return the homeroom class data for a teacher who is assigned as class teacher."""

    # Find the class where this user is the homeroom teacher
    cls = (
        await db.execute(
            select(Class).where(Class.school_id == school_id, Class.teacher_id == user.id)
        )
    ).scalar_one_or_none()

    if cls is None:
        return {"has_class": False, "class": None, "students": [], "stats": {
            "student_count": 0, "avg_balance": 0, "total_grades": 0, "avg_grade": 0,
        }}

    students = (
        await db.execute(
            select(User)
            .join(ClassStudent, ClassStudent.student_id == User.id)
            .where(ClassStudent.class_id == cls.id)
            .order_by(User.last_name, User.first_name)
        )
    ).scalars().all()

    student_ids = [s.id for s in students]
    total_grades = 0
    avg_grade = 0.0
    if student_ids:
        total_grades = await db.scalar(
            select(func.count()).select_from(Grade).where(
                Grade.student_id.in_(student_ids),
                Grade.school_id == school_id,
            )
        ) or 0
        avg_grade = round(
            await db.scalar(
                select(func.avg(Grade.grade_value)).where(
                    Grade.student_id.in_(student_ids),
                    Grade.school_id == school_id,
                    Grade.grade_value.isnot(None),
                )
            ) or 0,
            2,
        )

    return {
        "has_class": True,
        "class": {
            "id": cls.id,
            "name": cls.name,
            "grade_level": cls.grade_level,
            "is_profile": cls.is_profile,
        },
        "students": [
            {
                "id": u.id,
                "login": u.login,
                "first_name": u.first_name,
                "last_name": u.last_name,
                "patronymic": None,
                "balance": u.balance or 0,
                "is_online": False,
                "enrollment_status": "active",
            }
            for u in students
        ],
        "stats": {
            "student_count": len(students),
            "avg_balance": round(sum(u.balance or 0 for u in students) / max(len(students), 1), 2),
            "total_grades": int(total_grades),
            "avg_grade": avg_grade,
        },
    }


async def bulk_balance(db: AsyncSession, school_id: int, user: User,
                       student_ids: list[int], amount: int, comment: str = "") -> dict:
    """Add balance to multiple students in the teacher's homeroom class."""
    cls = (
        await db.execute(
            select(Class).where(Class.school_id == school_id, Class.teacher_id == user.id)
        )
    ).scalar_one_or_none()

    if cls is None:
        return {"message": "У вас нет классного руководства"}

    # Verify all students belong to this class
    cs_rows = (
        await db.execute(
            select(ClassStudent).where(
                ClassStudent.class_id == cls.id,
                ClassStudent.student_id.in_(student_ids),
            )
        )
    ).scalars().all()
    valid_ids = {cs.student_id for cs in cs_rows}

    if not valid_ids:
        return {"message": "Нет подходящих учеников"}

    for sid in valid_ids:
        student = await db.get(User, sid)
        if student:
            student.balance = (student.balance or 0) + amount

    await db.commit()

    reason = comment or f"Массовое начисление от классного руководителя"
    return {"message": f"Баланс обновлён для {len(valid_ids)} учеников (+{amount} ливок)"}
