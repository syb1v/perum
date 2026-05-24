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

router = APIRouter()


@router.get("/children")
async def children(user: User = Depends(require_parent), db: AsyncSession = Depends(get_db)) -> dict:
    return await service.list_children(db, user)


@router.get("/children/{student_id}/grades")
async def child_grades(
    student_id: int, user: User = Depends(require_parent), db: AsyncSession = Depends(get_db)
) -> dict:
    return await service.child_grades(db, user, student_id)


@router.get("/children/{student_id}/transactions")
async def child_transactions(
    student_id: int, user: User = Depends(require_parent), db: AsyncSession = Depends(get_db)
) -> dict:
    return await service.child_transactions(db, user, student_id)
