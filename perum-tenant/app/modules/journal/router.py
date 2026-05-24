"""Journal endpoints, mounted at /api/journal (legacy-compatible paths)."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import require_teacher
from app.models import User
from app.modules.journal import service
from app.modules.journal.schemas import AddGradeRequest, UpdateGradeRequest
from app.modules.school_admin.service import resolve_school_id

router = APIRouter()


async def _school(user: User, db: AsyncSession) -> int:
    return await resolve_school_id(user, db)


@router.get("/teacher/subjects")
async def teacher_subjects(user: User = Depends(require_teacher), db: AsyncSession = Depends(get_db)) -> dict:
    return await service.teacher_subjects(db, await _school(user, db), user)


@router.get("/work-types")
async def work_types(user: User = Depends(require_teacher), db: AsyncSession = Depends(get_db)) -> dict:
    return {"success": True, "work_types": await service.list_work_types(db, await _school(user, db))}


@router.get("/subjects")
async def subjects(user: User = Depends(require_teacher), db: AsyncSession = Depends(get_db)) -> dict:
    return {"subjects": await service.list_subjects(db, await _school(user, db))}


@router.get("/subjects/{subject_id}/topics")
async def subject_topics(
    subject_id: int, user: User = Depends(require_teacher), db: AsyncSession = Depends(get_db)
) -> dict:
    return {"topics": await service.list_topics(db, await _school(user, db), subject_id)}


@router.post("/grades")
async def add_grade(
    payload: AddGradeRequest, user: User = Depends(require_teacher), db: AsyncSession = Depends(get_db)
) -> dict:
    return await service.add_grade(db, await _school(user, db), payload, user)


@router.get("/grades/{grade_id}")
async def get_grade(
    grade_id: int, user: User = Depends(require_teacher), db: AsyncSession = Depends(get_db)
) -> dict:
    return await service.get_grade(db, await _school(user, db), grade_id)


@router.put("/grades/{grade_id}")
async def update_grade(
    grade_id: int,
    payload: UpdateGradeRequest,
    user: User = Depends(require_teacher),
    db: AsyncSession = Depends(get_db),
) -> dict:
    return await service.update_grade(db, await _school(user, db), grade_id, payload, user)


@router.delete("/grades/{grade_id}")
async def delete_grade(
    grade_id: int, user: User = Depends(require_teacher), db: AsyncSession = Depends(get_db)
) -> dict:
    return await service.delete_grade(db, await _school(user, db), grade_id, user)


# Catch-all two-segment route — must stay LAST so /grades, /subjects, etc. match first.
@router.get("/{class_id}/{subject_id}")
async def journal(
    class_id: int,
    subject_id: int,
    period_id: int | None = None,
    user: User = Depends(require_teacher),
    db: AsyncSession = Depends(get_db),
) -> dict:
    return await service.get_journal(db, await _school(user, db), class_id, subject_id, period_id, user)
