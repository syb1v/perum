"""Подключение узла организации (enrollment). Публичный handshake: новый сервер
орг при первом запуске предъявляет enrollment-токен и получает свою конфигурацию.

Аутентификация — сам токен (JWT тут нет: у узла пока ничего нет). Токен одноразовый
и с TTL. См. docs/ARCH_ORG_NODE.md.
"""

from __future__ import annotations

import hashlib
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import get_db
from app.models import EnrollmentToken, Organization, Release

router = APIRouter()


class EnrollRequest(BaseModel):
    token: str


@router.post("")
async def enroll(payload: EnrollRequest, db: AsyncSession = Depends(get_db)) -> dict:
    token_hash = hashlib.sha256(payload.token.encode()).hexdigest()
    row = (
        await db.execute(select(EnrollmentToken).where(EnrollmentToken.token_hash == token_hash))
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "недействительный токен подключения")
    if row.used_at is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "токен уже использован")
    if row.expires_at < datetime.utcnow():
        raise HTTPException(status.HTTP_410_GONE, "токен истёк")

    org = await db.get(Organization, row.org_id)
    if org is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "организация не найдена")

    row.used_at = datetime.utcnow()
    await db.commit()

    rel = (
        await db.execute(select(Release).where(Release.channel == "stable", Release.is_current.is_(True)).limit(1))
    ).scalar_one_or_none()
    settings = get_settings()
    return {
        "org_slug": org.slug,
        "org_name": org.name,
        "core_url": settings.CONTROL_PLANE_URL,
        "current_release": (
            {"version_tag": rel.version_tag, "image": rel.image} if rel else None
        ),
        "message": "узел подключён; поднимайте портал орг и провижиньте школы",
    }
