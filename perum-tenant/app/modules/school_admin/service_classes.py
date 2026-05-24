"""Classes: CRUD, students, schedule (view). Schedule editing with groups is a
later slice — GET shows seeded/created data."""

from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User
from app.models.academic import Class, ClassStudent, Schedule, Subject
from app.modules.school_admin.schemas import ClassCreate, ClassUpdate


def user_name(u: User | None) -> str | None:
    if u is None:
        return None
    full = f"{u.last_name or ''} {u.first_name or ''}".strip()
    return full or u.login


def _norm_id(v: int | None) -> int | None:
    return v if v else None  # treat 0 / None / "" as "no value"


async def list_classes(db: AsyncSession, school_id: int) -> list[dict]:
    classes = (
        await db.execute(
            select(Class).where(Class.school_id == school_id).order_by(Class.grade_level, Class.name)
        )
    ).scalars().all()
    out = []
    for c in classes:
        teacher = await db.get(User, c.teacher_id) if c.teacher_id else None
        count = await db.scalar(
            select(func.count()).select_from(ClassStudent).where(ClassStudent.class_id == c.id)
        )
        out.append(
            {
                "id": c.id,
                "name": c.name,
                "teacher": {"id": teacher.id, "name": user_name(teacher)} if teacher else None,
                "student_count": int(count or 0),
                "bell_schedule_id": c.bell_schedule_id,
                "grade_level": c.grade_level,
                "is_profile": c.is_profile,
                "parent_id": None,
                "created_at": c.created_at.isoformat() if c.created_at else None,
            }
        )
    return out


async def get_class(db: AsyncSession, school_id: int, class_id: int) -> Class:
    c = (
        await db.execute(select(Class).where(Class.id == class_id, Class.school_id == school_id))
    ).scalar_one_or_none()
    if c is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Класс не найден")
    return c


async def create_class(db: AsyncSession, school_id: int, data: ClassCreate) -> Class:
    c = Class(
        school_id=school_id,
        name=data.name,
        grade_level=data.grade_level,
        is_profile=data.is_profile,
        teacher_id=_norm_id(data.teacher_id),
        bell_schedule_id=_norm_id(data.bell_schedule_id),
    )
    db.add(c)
    await db.commit()
    await db.refresh(c)
    return c


async def update_class(db: AsyncSession, school_id: int, class_id: int, data: ClassUpdate) -> Class:
    c = await get_class(db, school_id, class_id)
    c.name = data.name
    c.grade_level = data.grade_level
    c.is_profile = data.is_profile
    c.teacher_id = _norm_id(data.teacher_id)
    c.bell_schedule_id = _norm_id(data.bell_schedule_id)
    await db.commit()
    return c


async def delete_class(db: AsyncSession, school_id: int, class_id: int) -> None:
    c = await get_class(db, school_id, class_id)
    await db.delete(c)
    await db.commit()


async def get_class_students(db: AsyncSession, school_id: int, class_id: int) -> dict:
    c = await get_class(db, school_id, class_id)
    rows = (
        await db.execute(
            select(User, ClassStudent.id)
            .join(ClassStudent, ClassStudent.student_id == User.id)
            .where(ClassStudent.class_id == class_id)
            .order_by(User.last_name, User.first_name)
        )
    ).all()
    students = [
        {
            "id": u.id,
            "login": u.login,
            "first_name": u.first_name,
            "last_name": u.last_name,
            "balance": u.balance,
            "membership_id": membership_id,
        }
        for (u, membership_id) in rows
    ]
    return {"class": {"id": c.id, "name": c.name}, "students": students}


async def add_student(db: AsyncSession, school_id: int, class_id: int, student_id: int) -> None:
    await get_class(db, school_id, class_id)
    exists = (
        await db.execute(
            select(ClassStudent).where(
                ClassStudent.class_id == class_id, ClassStudent.student_id == student_id
            )
        )
    ).scalar_one_or_none()
    if exists is None:
        db.add(ClassStudent(class_id=class_id, student_id=student_id))
        await db.commit()


async def remove_student(db: AsyncSession, school_id: int, class_id: int, student_id: int) -> None:
    await get_class(db, school_id, class_id)
    cs = (
        await db.execute(
            select(ClassStudent).where(
                ClassStudent.class_id == class_id, ClassStudent.student_id == student_id
            )
        )
    ).scalar_one_or_none()
    if cs is not None:
        await db.delete(cs)
        await db.commit()


async def get_class_schedule(db: AsyncSession, school_id: int, class_id: int) -> dict:
    c = await get_class(db, school_id, class_id)
    rows = (
        await db.execute(
            select(Schedule)
            .where(Schedule.class_id == class_id)
            .order_by(Schedule.day_of_week, Schedule.lesson_number)
        )
    ).scalars().all()
    schedule = []
    for s in rows:
        subject = await db.get(Subject, s.subject_id)
        teacher = await db.get(User, s.teacher_id) if s.teacher_id else None
        schedule.append(
            {
                "id": s.id,
                "day_of_week": s.day_of_week,
                "lesson_number": s.lesson_number,
                "subject": {"id": subject.id, "name": subject.name, "short_name": subject.short_name}
                if subject
                else None,
                "teacher": {"id": teacher.id, "name": user_name(teacher)} if teacher else None,
                "room": s.room,
                "groups": [],
            }
        )
    return {"class": {"id": c.id, "name": c.name}, "schedule": schedule}
