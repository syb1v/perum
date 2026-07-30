"""Student cabinet endpoints, mounted at /api/student (legacy-compatible paths).

Every endpoint is gated to role=student and the service scopes all reads to the
caller's own id — a student cannot read another student's diary or grades.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import require_student
from app.models import User
from app.modules.quests import service as quests_service
from app.modules.school_admin.service import resolve_school_id
from app.modules.student import service
from app.modules.student.schemas import (
    GradesAnalyticsOut,
    GradesSummaryOut,
    StudentDiaryOut,
    StudentFinalGradesOut,
    StudentGradesOut,
    StudentQuestOut,
    StudentRecentTransactionsOut,
)

router = APIRouter()


async def _school(user: User, db: AsyncSession) -> int:
    return await resolve_school_id(user, db)


@router.get("/transactions/recent", response_model=StudentRecentTransactionsOut)
async def recent_transactions(
    limit: int = Query(default=30, ge=1, le=50),
    user: User = Depends(require_student),
    db: AsyncSession = Depends(get_db),
) -> StudentRecentTransactionsOut:
    return StudentRecentTransactionsOut(
        await service.get_recent_transactions(db, await _school(user, db), user, limit)
    )


@router.get("/diary", response_model=StudentDiaryOut)
async def diary(
    week_offset: int = 0,
    user: User = Depends(require_student),
    db: AsyncSession = Depends(get_db),
) -> dict:
    return await service.get_diary(db, await _school(user, db), user, week_offset)


@router.get("/grades", response_model=StudentGradesOut)
async def grades(
    subject_id: int | None = None,
    user: User = Depends(require_student),
    db: AsyncSession = Depends(get_db),
) -> dict:
    return await service.get_grades(db, await _school(user, db), user, subject_id)


@router.get("/grades/summary", response_model=GradesSummaryOut)
async def grades_summary(
    user: User = Depends(require_student), db: AsyncSession = Depends(get_db)
) -> dict:
    return await service.get_summary(db, await _school(user, db), user)


@router.get("/grades/analytics", response_model=GradesAnalyticsOut)
async def grades_analytics(
    user: User = Depends(require_student), db: AsyncSession = Depends(get_db)
) -> dict:
    return await service.get_analytics(db, await _school(user, db), user)


@router.get("/grades/finals", response_model=StudentFinalGradesOut)
async def grades_finals(
    user: User = Depends(require_student), db: AsyncSession = Depends(get_db)
) -> dict:
    return await service.get_finals(db, await _school(user, db), user)


@router.get("/quests", response_model=list[StudentQuestOut])
async def quests(user: User = Depends(require_student), db: AsyncSession = Depends(get_db)) -> list:
    return await quests_service.get_student_quests(db, await _school(user, db), user)
