"""Grade-appeals router, mounted at /api/appeals.

- POST /            — подать апелляцию (ученик/родитель)
- GET  /            — список (ролевой; ?status=pending|approved|rejected)
- POST /{id}/resolve — решение (учитель-автор/админ)
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import get_current_user
from app.models import User
from app.modules.appeals import service
from app.modules.school_admin.service import resolve_school_id

router = APIRouter()


class AppealCreate(BaseModel):
    grade_id: int
    reason: str


class AppealResolve(BaseModel):
    status: str
    teacher_comment: str | None = None


@router.post("")
async def create_appeal(
    payload: AppealCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    school_id = await resolve_school_id(user, db)
    return await service.create_appeal(db, user, school_id, payload.grade_id, payload.reason)


@router.get("")
async def list_appeals(
    status: str | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    school_id = await resolve_school_id(user, db)
    return await service.list_appeals(db, user, school_id, status)


@router.post("/{appeal_id}/resolve")
async def resolve_appeal(
    appeal_id: int,
    payload: AppealResolve,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    school_id = await resolve_school_id(user, db)
    return await service.resolve_appeal(db, user, school_id, appeal_id, payload.status, payload.teacher_comment)
