"""Grade-appeals logic (Phase 8).

Создание — ученик (своя оценка) или родитель (оценка ребёнка). Просмотр —
ролевой: админ видит все по школе, учитель — апелляции на свои оценки, ученик —
свои, родитель — детей. Решение (approved/rejected + комментарий) — учитель-автор
оценки или администрация.
"""

from __future__ import annotations

from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.roles import ADMIN_ROLES
from app.models import GradeAppeal, ParentStudent, Subject, User
from app.models.journal import Grade

_RESOLVED = {"approved", "rejected"}


def _name(u: User | None) -> str:
    if not u:
        return ""
    return f"{u.last_name or ''} {u.first_name or ''}".strip() or u.login


async def _children_ids(db: AsyncSession, parent_id: int) -> list[int]:
    rows = await db.execute(select(ParentStudent.student_id).where(ParentStudent.parent_id == parent_id))
    return [r[0] for r in rows.all()]


async def create_appeal(db: AsyncSession, user: User, school_id: int, grade_id: int, reason: str) -> dict:
    reason = (reason or "").strip()
    if not reason:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Укажите причину апелляции")

    grade = await db.scalar(select(Grade).where(Grade.id == grade_id, Grade.school_id == school_id))
    if not grade:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Оценка не найдена")
    if grade.grade_value is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Эту запись нельзя оспорить")
    if grade.teacher_id is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "У оценки нет преподавателя — оспорить нельзя")

    # Кто оспаривает — ученик за себя или родитель за ребёнка.
    if user.role == "student":
        if grade.student_id != user.id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Это не ваша оценка")
    elif user.role == "parent":
        if grade.student_id not in await _children_ids(db, user.id):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Это оценка не вашего ребёнка")
    else:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Апелляцию подаёт ученик или родитель")

    existing = await db.scalar(
        select(GradeAppeal).where(
            GradeAppeal.grade_id == grade_id,
            GradeAppeal.student_id == grade.student_id,
            GradeAppeal.status == "pending",
        )
    )
    if existing:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Апелляция по этой оценке уже на рассмотрении")

    appeal = GradeAppeal(
        school_id=school_id,
        student_id=grade.student_id,
        grade_id=grade_id,
        teacher_id=grade.teacher_id,
        reason=reason,
        status="pending",
    )
    db.add(appeal)
    await db.commit()
    await db.refresh(appeal)
    return await _serialize(db, appeal)


async def _serialize(db: AsyncSession, a: GradeAppeal) -> dict:
    student = await db.get(User, a.student_id)
    teacher = await db.get(User, a.teacher_id)
    grade = await db.get(Grade, a.grade_id)
    subject = await db.get(Subject, grade.subject_id) if grade else None
    return {
        "id": a.id,
        "grade_id": a.grade_id,
        "grade_value": grade.grade_value if grade else None,
        "subject_name": subject.name if subject else None,
        "student_id": a.student_id,
        "student_name": _name(student),
        "teacher_id": a.teacher_id,
        "teacher_name": _name(teacher),
        "reason": a.reason,
        "status": a.status,
        "teacher_comment": a.teacher_comment,
        "created_at": a.created_at.isoformat() if a.created_at else None,
        "resolved_at": a.resolved_at.isoformat() if a.resolved_at else None,
    }


async def list_appeals(db: AsyncSession, user: User, school_id: int, status_filter: str | None) -> dict:
    stmt = select(GradeAppeal).where(GradeAppeal.school_id == school_id)
    if user.role in ADMIN_ROLES:
        pass  # все по школе
    elif user.role == "teacher":
        stmt = stmt.where(GradeAppeal.teacher_id == user.id)
    elif user.role == "student":
        stmt = stmt.where(GradeAppeal.student_id == user.id)
    elif user.role == "parent":
        stmt = stmt.where(GradeAppeal.student_id.in_(await _children_ids(db, user.id) or [-1]))
    else:
        return {"appeals": []}

    if status_filter:
        stmt = stmt.where(GradeAppeal.status == status_filter)
    stmt = stmt.order_by(GradeAppeal.created_at.desc())

    rows = (await db.execute(stmt)).scalars().all()
    return {"appeals": [await _serialize(db, a) for a in rows]}


async def resolve_appeal(db: AsyncSession, user: User, school_id: int, appeal_id: int, new_status: str, comment: str | None) -> dict:
    if new_status not in _RESOLVED:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "status должен быть approved или rejected")

    appeal = await db.scalar(
        select(GradeAppeal).where(GradeAppeal.id == appeal_id, GradeAppeal.school_id == school_id)
    )
    if not appeal:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Апелляция не найдена")

    # Решает администрация или учитель-автор оценки.
    is_admin = user.role in ADMIN_ROLES
    if not is_admin and appeal.teacher_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Нет прав на решение по этой апелляции")
    if appeal.status != "pending":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Апелляция уже рассмотрена")

    appeal.status = new_status
    appeal.teacher_comment = (comment or "").strip() or None
    appeal.resolved_at = datetime.utcnow()
    await db.commit()
    await db.refresh(appeal)
    return await _serialize(db, appeal)
