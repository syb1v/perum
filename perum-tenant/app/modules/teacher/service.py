"""Teacher-facing data: own classes, subjects, class rosters."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User
from app.models.academic import Class, ClassStudent, Subject, TeacherSubject


def _is_admin(user: User) -> bool:
    # org_admin внутрь школы не заходит — см. journal/service.py. Убран org_admin.
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
