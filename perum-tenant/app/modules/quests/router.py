"""Quest action endpoints, mounted at /api/quests (legacy-compatible paths).

The student dashboard uses POST /api/quests/take/{quest_id} and
POST /api/quests/claim/{user_quest_id}. The quest LIST lives at
/api/student/quests (student router). Gated to role=student.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import require_admin, require_student
from app.models import Quest, User
from app.modules.quests import service
from app.modules.school_admin.service import resolve_school_id

router = APIRouter()


# --- Admin-CRUD квестов (school_admin/director), скоуп по своей школе. Закрывает
# пробел «QuestManagement.tsx звал несуществующий бэкенд» (AUDIT_2026-06-12, 2.9). ---

class QuestPayload(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    reward: int = Field(default=0, ge=0)
    quest_type: str = "positive_grades"
    conditions: str | None = None  # JSON-строка {"target_count": N}
    status: str = "available"
    class_id: int | None = None
    subject_id: int | None = None
    target_grades: str | None = None


def _quest_dict(q: Quest) -> dict:
    return {
        "id": q.id, "title": q.title, "description": q.description, "reward": q.reward,
        "quest_type": q.quest_type, "conditions": q.conditions, "status": q.status,
        "class_id": q.class_id, "subject_id": q.subject_id, "target_grades": q.target_grades,
        "expires_at": q.expires_at.isoformat() if q.expires_at else None,
        "created_at": q.created_at.isoformat() if q.created_at else None,
    }


async def _get_school_quest(quest_id: int, school_id: int, db: AsyncSession) -> Quest:
    q = await db.get(Quest, quest_id)
    if q is None or q.school_id != school_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "квест не найден")
    return q


@router.get("")
async def list_quests(user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)) -> list[dict]:
    school_id = await resolve_school_id(user, db)
    rows = (await db.execute(select(Quest).where(Quest.school_id == school_id).order_by(Quest.id.desc()))).scalars().all()
    return [_quest_dict(q) for q in rows]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_quest(payload: QuestPayload, user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)) -> dict:
    school_id = await resolve_school_id(user, db)
    q = Quest(school_id=school_id, **payload.model_dump())
    db.add(q)
    await db.commit()
    await db.refresh(q)
    return _quest_dict(q)


@router.put("/{quest_id}")
async def update_quest(quest_id: int, payload: QuestPayload, user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)) -> dict:
    school_id = await resolve_school_id(user, db)
    q = await _get_school_quest(quest_id, school_id, db)
    # Частичный апдейт: фронт при редактировании НЕ шлёт class_id/subject_id/
    # target_grades — без exclude_unset они затёрлись бы в NULL (потеря таргетинга).
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(q, k, v)
    await db.commit()
    await db.refresh(q)
    return _quest_dict(q)


@router.delete("/{quest_id}")
async def delete_quest(quest_id: int, user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)) -> dict:
    school_id = await resolve_school_id(user, db)
    q = await _get_school_quest(quest_id, school_id, db)
    await db.delete(q)
    await db.commit()
    return {"success": True, "id": quest_id}


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
