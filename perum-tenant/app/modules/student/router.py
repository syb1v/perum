"""Student cabinet endpoints, mounted at /api/student (legacy-compatible paths).

Every endpoint is gated to role=student and the service scopes all reads to the
caller's own id — a student cannot read another student's diary or grades.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import require_student
from app.models import User
from app.modules.quests import service as quests_service
from app.modules.school_admin.service import resolve_school_id
from app.modules.student import service

router = APIRouter()


async def _school(user: User, db: AsyncSession) -> int:
    return await resolve_school_id(user, db)


@router.get("/diary")
async def diary(
    week_offset: int = 0,
    user: User = Depends(require_student),
    db: AsyncSession = Depends(get_db),
) -> dict:
    return await service.get_diary(db, await _school(user, db), user, week_offset)


@router.get("/grades")
async def grades(
    subject_id: int | None = None,
    user: User = Depends(require_student),
    db: AsyncSession = Depends(get_db),
) -> dict:
    return await service.get_grades(db, await _school(user, db), user, subject_id)


@router.get("/grades/summary")
async def grades_summary(
    user: User = Depends(require_student), db: AsyncSession = Depends(get_db)
) -> dict:
    return await service.get_summary(db, await _school(user, db), user)


@router.get("/grades/analytics")
async def grades_analytics(
    user: User = Depends(require_student), db: AsyncSession = Depends(get_db)
) -> dict:
    return await service.get_analytics(db, await _school(user, db), user)


@router.get("/grades/finals")
async def grades_finals(
    user: User = Depends(require_student), db: AsyncSession = Depends(get_db)
) -> dict:
    return await service.get_finals(db, await _school(user, db), user)


@router.get("/quests")
async def quests(user: User = Depends(require_student), db: AsyncSession = Depends(get_db)) -> list:
    return await quests_service.get_student_quests(db, await _school(user, db), user)
