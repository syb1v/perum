"""Teachers list + teacher↔subject↔class assignments (assign/unassign).

Bulk `sync` and teacher schedule editing are a later slice — listing works."""

from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.roles import TEACHER
from app.models import User
from app.models.academic import Class, Subject, TeacherSubject
from app.modules.school_admin.schemas import TeacherSubjectAssign


async def list_teachers(db: AsyncSession, school_id: int) -> list[dict]:
    teachers = (
        await db.execute(
            select(User)
            .where(User.school_id == school_id, User.role == TEACHER)
            .order_by(User.last_name, User.first_name)
        )
    ).scalars().all()
    out = []
    for t in teachers:
        assigns = (
            await db.execute(select(TeacherSubject).where(TeacherSubject.teacher_id == t.id))
        ).scalars().all()
        a_list = []
        for a in assigns:
            subject = await db.get(Subject, a.subject_id)
            cls = await db.get(Class, a.class_id)
            a_list.append(
                {
                    "id": a.id,
                    "subject": {"id": subject.id, "name": subject.name} if subject else None,
                    "class_val": {"id": cls.id, "name": cls.name} if cls else None,
                }
            )
        out.append(
            {
                "id": t.id,
                "login": t.login,
                "first_name": t.first_name,
                "last_name": t.last_name,
                "patronymic": None,
                "email": t.email,
                "phone": None,
                "assignments": a_list,
            }
        )
    return out


async def assign(db: AsyncSession, school_id: int, data: TeacherSubjectAssign) -> TeacherSubject:
    exists = (
        await db.execute(
            select(TeacherSubject).where(
                TeacherSubject.teacher_id == data.teacher_id,
                TeacherSubject.subject_id == data.subject_id,
                TeacherSubject.class_id == data.class_id,
            )
        )
    ).scalar_one_or_none()
    if exists is not None:
        return exists
    ts = TeacherSubject(
        school_id=school_id,
        teacher_id=data.teacher_id,
        subject_id=data.subject_id,
        class_id=data.class_id,
    )
    db.add(ts)
    await db.commit()
    await db.refresh(ts)
    return ts


async def delete_assignment(db: AsyncSession, school_id: int, assignment_id: int) -> None:
    ts = (
        await db.execute(
            select(TeacherSubject).where(
                TeacherSubject.id == assignment_id, TeacherSubject.school_id == school_id
            )
        )
    ).scalar_one_or_none()
    if ts is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Назначение не найдено")
    await db.delete(ts)
    await db.commit()
