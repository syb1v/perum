"""Teacher endpoints, mounted at /api/teacher (legacy-compatible paths)."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import require_teacher
from app.models import User
from app.modules.school_admin.service import resolve_school_id
from app.modules.teacher import service

router = APIRouter()


async def _school(user: User, db: AsyncSession) -> int:
    return await resolve_school_id(user, db)


@router.get("/classes")
async def classes(user: User = Depends(require_teacher), db: AsyncSession = Depends(get_db)) -> dict:
    return {"classes": await service.teacher_classes(db, await _school(user, db), user)}


@router.get("/classes/{class_id}/students")
async def class_students(
    class_id: int, user: User = Depends(require_teacher), db: AsyncSession = Depends(get_db)
) -> dict:
    return {"students": await service.class_students(db, await _school(user, db), class_id)}


@router.get("/subjects")
async def subjects(user: User = Depends(require_teacher), db: AsyncSession = Depends(get_db)) -> dict:
    return {"subjects": await service.teacher_subjects(db, await _school(user, db), user)}


@router.get("/diary")
async def diary(
    week_offset: int = 0,
    user: User = Depends(require_teacher),
    db: AsyncSession = Depends(get_db),
) -> dict:
    return await service.teacher_diary(db, await _school(user, db), user, week_offset)


@router.get("/my-class")
async def my_class(user: User = Depends(require_teacher), db: AsyncSession = Depends(get_db)) -> dict:
    return await service.my_class(db, await _school(user, db), user)


class BulkBalancePayload(BaseModel):
    student_ids: list[int]
    amount: int
    comment: str | None = None


@router.post("/my-class/bulk-balance")
async def bulk_balance(
    payload: BulkBalancePayload,
    user: User = Depends(require_teacher),
    db: AsyncSession = Depends(get_db),
) -> dict:
    return await service.bulk_balance(
        db, await _school(user, db), user,
        payload.student_ids, payload.amount, payload.comment or "",
    )


@router.get("/works")
async def works(
    class_id: int | None = None,
    subject_id: int | None = None,
    user: User = Depends(require_teacher),
    db: AsyncSession = Depends(get_db),
) -> dict:
    return {"works": []}


@router.get("/homework")
async def homework(
    class_id: int | None = None,
    subject_id: int | None = None,
    user: User = Depends(require_teacher),
    db: AsyncSession = Depends(get_db),
) -> dict:
    return {"homework": []}


@router.get("/control-works")
async def control_works(
    class_id: int | None = None,
    subject_id: int | None = None,
    user: User = Depends(require_teacher),
    db: AsyncSession = Depends(get_db),
) -> dict:
    return {"control_works": []}
