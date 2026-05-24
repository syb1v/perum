"""Quest logic (Phase 7), ported from the legacy quest service.

Grade-based quests recompute progress on read (positive_grades: count of 4/5
since the quest was taken; no_threes: current 4/5 streak). When progress meets
target the quest becomes "ready". Claiming awards livki (Transaction type=quest)
— claim accepts a ready quest directly (the copied frontend has no separate
"complete" step), and also a completed one. All school-scoped.
"""

from __future__ import annotations

import json
from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Quest, Transaction, User, UserQuest
from app.models.academic import Class, ClassStudent
from app.models.journal import Grade


def _target_of(quest: Quest) -> int:
    if quest.conditions:
        try:
            cond = json.loads(quest.conditions)
            if "target_count" in cond:
                return int(cond["target_count"])
            if "target_avg" in cond:
                return int(cond["target_avg"])
        except (ValueError, TypeError, KeyError):
            pass
    return 1


async def _grade_progress(db: AsyncSession, user_id: int, quest_type: str, since: datetime) -> int:
    if quest_type == "positive_grades":
        return (
            await db.scalar(
                select(func.count(Grade.id)).where(
                    Grade.student_id == user_id,
                    Grade.grade_value.in_([4, 5]),
                    Grade.created_at >= since,
                )
            )
        ) or 0
    if quest_type == "no_threes":
        grades = (
            await db.execute(
                select(Grade.grade_value)
                .where(Grade.student_id == user_id, Grade.created_at >= since, Grade.grade_value.isnot(None))
                .order_by(Grade.created_at)
            )
        ).scalars().all()
        streak = 0
        for g in grades:
            streak = streak + 1 if g >= 4 else 0
        return streak
    return 0


async def update_quest_progress(db: AsyncSession, user_id: int) -> None:
    active = (
        await db.execute(
            select(UserQuest).where(UserQuest.user_id == user_id, UserQuest.status == "active")
        )
    ).scalars().all()
    changed = False
    for uq in active:
        quest = await db.get(Quest, uq.quest_id)
        if quest is None:
            continue
        progress = await _grade_progress(db, user_id, quest.quest_type, uq.started_at)
        if progress != uq.progress:
            uq.progress = progress
            uq.last_updated = datetime.utcnow()
            changed = True
        if progress >= uq.target and uq.status == "active":
            uq.status = "ready"
            changed = True
    if changed:
        await db.commit()


async def _student_grade_level(db: AsyncSession, user_id: int) -> str | None:
    grade = await db.scalar(
        select(Class.grade_level)
        .join(ClassStudent, ClassStudent.class_id == Class.id)
        .where(ClassStudent.student_id == user_id)
    )
    return str(grade) if grade is not None else None


async def get_student_quests(db: AsyncSession, school_id: int, user: User) -> list[dict]:
    await update_quest_progress(db, user.id)
    grade_level = await _student_grade_level(db, user.id)

    quests = (
        await db.execute(
            select(Quest).where(Quest.school_id == school_id, Quest.status == "available")
        )
    ).scalars().all()

    out: list[dict] = []
    for quest in quests:
        if quest.target_grades and quest.target_grades != grade_level:
            continue
        target = _target_of(quest)
        uq = (
            await db.execute(
                select(UserQuest).where(UserQuest.user_id == user.id, UserQuest.quest_id == quest.id)
            )
        ).scalar_one_or_none()

        if uq is None and quest.quest_type == "daily_login":
            uq = UserQuest(
                school_id=school_id, user_id=user.id, quest_id=quest.id,
                status="active", progress=0, target=target, reward_claimed=0,
            )
            db.add(uq)
            await db.commit()
            await db.refresh(uq)

        if uq is not None:
            st = "ready" if uq.progress >= uq.target and uq.status == "active" else uq.status
            out.append({
                "id": uq.id, "quest_id": quest.id, "title": quest.title,
                "description": quest.description, "reward": quest.reward,
                "progress": uq.progress, "target": uq.target, "status": st,
                "reward_claimed": uq.reward_claimed == 1,
            })
        else:
            out.append({
                "id": None, "quest_id": quest.id, "title": quest.title,
                "description": quest.description, "reward": quest.reward,
                "progress": 0, "target": target, "status": "available", "reward_claimed": False,
            })
    return out


async def take_quest(db: AsyncSession, school_id: int, user: User, quest_id: int) -> dict:
    quest = (
        await db.execute(select(Quest).where(Quest.id == quest_id, Quest.school_id == school_id))
    ).scalar_one_or_none()
    if quest is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Квест не найден")
    if quest.status != "available":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Квест недоступен")
    exists = (
        await db.execute(
            select(UserQuest.id).where(UserQuest.user_id == user.id, UserQuest.quest_id == quest_id)
        )
    ).scalar_one_or_none()
    if exists:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Квест уже взят")
    db.add(UserQuest(
        school_id=school_id, user_id=user.id, quest_id=quest_id,
        status="active", progress=0, target=_target_of(quest), reward_claimed=0,
    ))
    await db.commit()
    return {"success": True, "message": "Квест принят!"}


async def _own_user_quest(db: AsyncSession, user_id: int, user_quest_id: int) -> tuple[UserQuest, Quest]:
    row = (
        await db.execute(
            select(UserQuest, Quest).join(Quest, Quest.id == UserQuest.quest_id).where(UserQuest.id == user_quest_id)
        )
    ).first()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Квест не найден")
    uq, quest = row
    if uq.user_id != user_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Это не ваш квест")
    return uq, quest


async def complete_quest(db: AsyncSession, user: User, user_quest_id: int) -> dict:
    uq, _ = await _own_user_quest(db, user.id, user_quest_id)
    if uq.status != "ready":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Квест ещё не готов к завершению")
    uq.status = "completed"
    uq.completed_at = datetime.utcnow()
    await db.commit()
    return {"success": True, "message": "Квест успешно завершён!"}


async def claim_reward(db: AsyncSession, user: User, user_quest_id: int) -> dict:
    uq, quest = await _own_user_quest(db, user.id, user_quest_id)
    # Live frontend has no separate "complete" step — accept a ready quest here.
    if uq.status not in ("ready", "completed"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Квест ещё не выполнен")
    if uq.reward_claimed == 1:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Награда уже получена")

    db_user = await db.get(User, user.id)
    new_balance = max((db_user.balance or 0) + quest.reward, 0)
    db_user.balance = new_balance
    uq.status = "completed"
    uq.completed_at = uq.completed_at or datetime.utcnow()
    uq.reward_claimed = 1
    db.add(Transaction(
        school_id=db_user.school_id, user_id=user.id, amount=quest.reward, balance_after=new_balance,
        type="quest", reason=f"Награда за квест: {quest.title}", related_id=uq.id, created_by=user.id,
    ))
    await db.commit()
    return {"success": True, "new_balance": new_balance, "message": f"Получено {quest.reward} ливок"}
