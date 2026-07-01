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
from app.models import EnrollmentToken, Node, Organization, Release

router = APIRouter()


class EnrollRequest(BaseModel):
    token: str
    # Характеристики сервера, которые воркер ноды снимает сам (psutil) и сообщает
    # ядру при подключении — оператору не нужно вводить их вручную в мастере.
    cpu_cores: int | None = None
    ram_gb: float | None = None
    disk_gb: float | None = None
    agent_version: str | None = None


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

    # org_id может быть пустым — это pool-нода (общий пул, без организации). Это норма,
    # а не ошибка: такую ноду позже привяжут к орг или используют под пул школ.
    org = await db.get(Organization, row.org_id) if row.org_id else None

    row.used_at = datetime.utcnow()

    # Привязать enrollment-токен к ноде и обновить её запись: статус active, heartbeat,
    # версия агента и РЕАЛЬНЫЕ характеристики железа, снятые воркером на сервере.
    node = (
        await db.execute(select(Node).where(Node.enrollment_token_id == row.id))
    ).scalar_one_or_none()
    if node is not None:
        node.status = "active"
        node.last_heartbeat = datetime.utcnow()
        if payload.agent_version:
            node.agent_version = payload.agent_version
        if payload.cpu_cores:
            node.cpu_cores = payload.cpu_cores
        if payload.ram_gb:
            node.ram_gb = payload.ram_gb
        if payload.disk_gb:
            node.disk_gb = payload.disk_gb

    await db.commit()

    rel = (
        await db.execute(select(Release).where(Release.channel == "stable", Release.is_current.is_(True)).limit(1))
    ).scalar_one_or_none()
    settings = get_settings()
    return {
        # Для pool-ноды орг нет — отдаём служебный slug "pool", чтобы воркер мог
        # сохранить состояние (AgentState.org_slug — NOT NULL).
        "org_slug": org.slug if org else "pool",
        "org_name": org.name if org else None,
        "core_url": settings.CONTROL_PLANE_URL,
        "current_release": (
            {"version_tag": rel.version_tag, "image": rel.image} if rel else None
        ),
        "message": "узел подключён; поднимайте портал орг и провижиньте школы",
    }
