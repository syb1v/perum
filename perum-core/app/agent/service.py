"""Агент организации (ROLE=org_agent): enroll-on-boot (см. docs/ARCH_ORG_NODE.md).

При старте узел орг предъявляет свой ENROLLMENT_TOKEN ядру (`POST /api/enroll`),
получает org_slug + текущий релиз и сохраняет локально (`agent_state`). Идемпотентно:
если уже подключён — ничего не делает. Ошибки не валят старт (повтор на следующем
старте). Перемещение владения школами в БД агента — следующий слой.
"""

from __future__ import annotations

import logging

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import SessionLocal
from app.models import AgentState

logger = logging.getLogger("perum.agent")


async def get_agent_state(db: AsyncSession) -> AgentState | None:
    return await db.scalar(select(AgentState).limit(1))


async def enroll_on_boot() -> None:
    settings = get_settings()
    if settings.ROLE != "org_agent":
        return
    try:
        async with SessionLocal() as db:
            existing = await get_agent_state(db)
            if existing is not None:
                logger.info("agent: уже подключён к орг '%s'", existing.org_slug)
                return
            if not settings.ENROLLMENT_TOKEN:
                logger.warning("agent: ENROLLMENT_TOKEN не задан — пропускаю enroll")
                return

            url = f"{settings.CORE_URL.rstrip('/')}/api/enroll"
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(url, json={"token": settings.ENROLLMENT_TOKEN})
            if resp.status_code >= 300:
                logger.error("agent: enroll не удался: %s %s", resp.status_code, resp.text[:300])
                return
            data = resp.json()
            rel = (data.get("current_release") or {})
            db.add(AgentState(
                id=1,
                org_slug=data["org_slug"],
                org_name=data.get("org_name"),
                core_url=settings.CORE_URL,
                release_tag=rel.get("image") or rel.get("version_tag"),
            ))
            await db.commit()
            logger.info("agent: подключён к орг '%s' (релиз %s)", data["org_slug"], db and rel.get("version_tag"))
    except Exception as exc:  # noqa: BLE001 — не валим старт (например, БД ещё не мигрирована)
        logger.warning("agent: enroll-on-boot отложен: %s", exc)
