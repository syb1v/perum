"""Leaderboard endpoint, mounted at /api/leaderboard (legacy-compatible path).

Open to any authenticated user; the board scope is derived from the caller's
class. The student dashboard polls this per subject.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import get_current_user
from app.models import User
from app.modules.leaderboard import service
from app.modules.school_admin.service import resolve_school_id

router = APIRouter()


@router.get("/{subject_id}")
async def leaderboard(
    subject_id: int,
    month: int | None = None,
    year: int | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    school_id = await resolve_school_id(user, db)
    return await service.get_leaderboard(db, school_id, user, subject_id, month, year)
