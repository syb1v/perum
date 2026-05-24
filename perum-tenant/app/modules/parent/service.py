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

from app.models import ParentStudent, Subject, User
from app.models.academic import Class, ClassStudent, WorkType
from app.models.journal import Grade, Transaction


async def _ensure_link(db: AsyncSession, parent_id: int, student_id: int) -> None:
    link = (
        await db.execute(
            select(ParentStudent.id).where(
                ParentStudent.parent_id == parent_id, ParentStudent.student_id == student_id
            )
        )
    ).scalar_one_or_none()
    if link is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Это не ваш ребёнок")


async def list_children(db: AsyncSession, parent: User) -> dict:
    student_ids = (
        await db.execute(select(ParentStudent.student_id).where(ParentStudent.parent_id == parent.id))
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
                .where(ClassStudent.student_id == sid)
            )
        ).scalar_one_or_none()
        avg_grade = (
            await db.scalar(
                select(func.avg(Grade.grade_value)).where(
                    Grade.student_id == sid, Grade.grade_value.isnot(None)
                )
            )
        ) or 0
        total = (
            await db.scalar(select(func.count()).select_from(Grade).where(Grade.student_id == sid))
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
                "avg_grade": round(float(avg_grade), 2),
                "total_grades": total,
                "enrollment_status": "active",
            }
        )
    return {"children": children}


async def child_grades(db: AsyncSession, parent: User, student_id: int) -> dict:
    await _ensure_link(db, parent.id, student_id)
    rows = (
        await db.execute(
            select(Grade, Subject)
            .join(Subject, Subject.id == Grade.subject_id)
            .where(Grade.student_id == student_id)
            .order_by(Grade.created_at.desc())
            .limit(100)
        )
    ).all()
    wt = {
        w.id: w.name
        for w in (await db.execute(select(WorkType))).scalars().all()
    }
    return {
        "grades": [
            {
                "id": g.id,
                "value": g.grade_value,
                "subject_name": subj.name,
                "work_type": wt.get(g.work_type_id, "ответ"),
                "comment": g.comment,
                "created_at": g.created_at.isoformat() if g.created_at else None,
            }
            for g, subj in rows
        ]
    }


async def child_transactions(db: AsyncSession, parent: User, student_id: int) -> dict:
    await _ensure_link(db, parent.id, student_id)
    rows = (
        await db.execute(
            select(Transaction)
            .where(Transaction.user_id == student_id)
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
