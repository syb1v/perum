"""Parent cabinet logic (Phase 6), ported from the legacy parent router.

Read-only: a parent sees the children linked to them via ParentStudent. Every
child-scoped read first verifies the link (a parent can only read their own
children). avg_grade uses grade_value (the 1–5 mark); the `value` column here is
livki points, so it is reported separately as balance/transactions.
"""

from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ParentStudent, User
from app.models.academic import Class, ClassStudent
from app.models.journal import Grade, Transaction
from app.modules.student import service as student_service


async def _linked_student(db: AsyncSession, school_id: int, parent: User, student_id: int) -> User:
    student = (
        await db.execute(
            select(User)
            .select_from(ParentStudent)
            .join(User, User.id == ParentStudent.student_id)
            .where(
                ParentStudent.parent_id == parent.id,
                ParentStudent.student_id == student_id,
                parent.role == "parent",
                parent.school_id == school_id,
                parent.is_active,
                User.role == "student",
                User.school_id == school_id,
                User.is_active.is_(True),
            )
        )
    ).scalar_one_or_none()
    if student is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Это не ваш ребёнок")
    return student


async def _ensure_link(db: AsyncSession, school_id: int, parent: User, student_id: int) -> None:
    await _linked_student(db, school_id, parent, student_id)


async def list_children(db: AsyncSession, school_id: int, parent: User) -> dict:
    student_ids = (
        await db.execute(
            select(ParentStudent.student_id)
            .join(User, User.id == ParentStudent.student_id)
            .where(
                ParentStudent.parent_id == parent.id,
                parent.role == "parent",
                parent.school_id == school_id,
                parent.is_active,
                User.school_id == school_id,
                User.role == "student",
                User.is_active.is_(True),
            )
        )
    ).scalars().all()
    children = []
    for sid in student_ids:
        student = await db.get(User, sid)
        if student is None:
            continue
        cls = (
            await db.execute(
                select(Class)
                .join(ClassStudent, ClassStudent.class_id == Class.id)
                .where(ClassStudent.student_id == sid, Class.school_id == school_id)
            )
        ).scalar_one_or_none()
        avg_grade = (
            await db.scalar(
                select(func.avg(Grade.grade_value)).where(
                    Grade.student_id == sid, Grade.school_id == school_id, Grade.grade_value.isnot(None)
                )
            )
        ) or 0
        total = (
            await db.scalar(
                select(func.count()).select_from(Grade).where(
                    Grade.student_id == sid, Grade.school_id == school_id
                )
            )
        ) or 0
        children.append(
            {
                "id": student.id,
                "first_name": student.first_name,
                "last_name": student.last_name,
                "patronymic": None,
                "balance": student.balance,
                "class_name": cls.name if cls else None,
                "class_id": cls.id if cls else None,
                "average": round(float(avg_grade), 2),
                "total_grades": total,
                "enrollment_status": "active",
            }
        )
    return {"children": children}


async def child_diary(db: AsyncSession, school_id: int, parent: User, student_id: int, week_offset: int) -> dict:
    student = await _linked_student(db, school_id, parent, student_id)
    return await student_service.get_diary(db, school_id, student, week_offset)


async def child_grades(
    db: AsyncSession, school_id: int, parent: User, student_id: int, subject_id: int | None = None
) -> dict:
    student = await _linked_student(db, school_id, parent, student_id)
    return await student_service.get_grades(db, school_id, student, subject_id)


async def child_grades_summary(db: AsyncSession, school_id: int, parent: User, student_id: int) -> dict:
    student = await _linked_student(db, school_id, parent, student_id)
    return await student_service.get_summary(db, school_id, student)


async def child_grades_analytics(db: AsyncSession, school_id: int, parent: User, student_id: int) -> dict:
    student = await _linked_student(db, school_id, parent, student_id)
    return await student_service.get_analytics(db, school_id, student)


async def child_grades_finals(db: AsyncSession, school_id: int, parent: User, student_id: int) -> dict:
    student = await _linked_student(db, school_id, parent, student_id)
    return await student_service.get_finals(db, school_id, student)


async def child_transactions(db: AsyncSession, school_id: int, parent: User, student_id: int) -> dict:
    await _ensure_link(db, school_id, parent, student_id)
    rows = (
        await db.execute(
            select(Transaction)
            .where(Transaction.user_id == student_id, Transaction.school_id == school_id)
            .order_by(Transaction.created_at.desc())
            .limit(50)
        )
    ).scalars().all()
    return {
        "transactions": [
            {
                "id": t.id,
                "amount": t.amount,
                "balance_after": t.balance_after,
                "type": t.type,
                "reason": t.reason,
                "created_at": t.created_at.isoformat() if t.created_at else None,
            }
            for t in rows
        ]
    }
