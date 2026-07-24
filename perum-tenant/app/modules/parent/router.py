"""Parent cabinet endpoints, mounted at /api/parent (legacy-compatible paths).

Read-only; gated to role=parent. Each child read re-checks the parent↔student
link in the service.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import require_parent
from app.models import User
from app.modules.parent import service
from app.modules.parent.schemas import ParentChildrenOut, ParentTransactionsOut
from app.modules.school_admin.service import resolve_school_id
from app.modules.student.schemas import (
    GradesAnalyticsOut,
    GradesSummaryOut,
    StudentDiaryOut,
    StudentFinalGradesOut,
    StudentGradesOut,
)

router = APIRouter()


@router.get("/children", response_model=ParentChildrenOut)
async def children(user: User = Depends(require_parent), db: AsyncSession = Depends(get_db)) -> dict:
    return await service.list_children(db, await resolve_school_id(user, db), user)


@router.get("/children/{student_id}/grades", response_model=StudentGradesOut)
async def child_grades(
    student_id: int,
    subject_id: int | None = None,
    user: User = Depends(require_parent),
    db: AsyncSession = Depends(get_db),
) -> dict:
    return await service.child_grades(db, await resolve_school_id(user, db), user, student_id, subject_id)


@router.get("/children/{student_id}/diary", response_model=StudentDiaryOut)
async def child_diary(
    student_id: int,
    week_offset: int = 0,
    user: User = Depends(require_parent),
    db: AsyncSession = Depends(get_db),
) -> dict:
    return await service.child_diary(db, await resolve_school_id(user, db), user, student_id, week_offset)


@router.get("/children/{student_id}/grades/summary", response_model=GradesSummaryOut)
async def child_grades_summary(
    student_id: int, user: User = Depends(require_parent), db: AsyncSession = Depends(get_db)
) -> dict:
    return await service.child_grades_summary(db, await resolve_school_id(user, db), user, student_id)


@router.get("/children/{student_id}/grades/analytics", response_model=GradesAnalyticsOut)
async def child_grades_analytics(
    student_id: int, user: User = Depends(require_parent), db: AsyncSession = Depends(get_db)
) -> dict:
    return await service.child_grades_analytics(db, await resolve_school_id(user, db), user, student_id)


@router.get("/children/{student_id}/grades/finals", response_model=StudentFinalGradesOut)
async def child_grades_finals(
    student_id: int, user: User = Depends(require_parent), db: AsyncSession = Depends(get_db)
) -> dict:
    return await service.child_grades_finals(db, await resolve_school_id(user, db), user, student_id)


@router.get("/children/{student_id}/transactions", response_model=ParentTransactionsOut)
async def child_transactions(
    student_id: int, user: User = Depends(require_parent), db: AsyncSession = Depends(get_db)
) -> dict:
    return await service.child_transactions(db, await resolve_school_id(user, db), user, student_id)
