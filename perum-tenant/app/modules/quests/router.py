"""Quest action endpoints, mounted at /api/quests (legacy-compatible paths).

The student dashboard uses POST /api/quests/take/{quest_id} and
POST /api/quests/claim/{user_quest_id}. The quest LIST lives at
/api/student/quests (student router). Gated to role=student.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import require_student
from app.models import User
from app.modules.quests import service
from app.modules.school_admin.service import resolve_school_id

router = APIRouter()


@router.post("/take/{quest_id}")
async def take(
    quest_id: int, user: User = Depends(require_student), db: AsyncSession = Depends(get_db)
) -> dict:
    return await service.take_quest(db, await resolve_school_id(user, db), user, quest_id)


@router.post("/claim/{user_quest_id}")
async def claim(
    user_quest_id: int, user: User = Depends(require_student), db: AsyncSession = Depends(get_db)
) -> dict:
    return await service.claim_reward(db, user, user_quest_id)


@router.post("/complete/{user_quest_id}")
async def complete(
    user_quest_id: int, user: User = Depends(require_student), db: AsyncSession = Depends(get_db)
) -> dict:
    return await service.complete_quest(db, user, user_quest_id)
