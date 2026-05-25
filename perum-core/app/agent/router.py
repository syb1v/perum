"""Агент орг: статус узла (кто я, к какой орг подключён)."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.service import get_agent_state
from app.core.config import get_settings
from app.core.db import get_db

router = APIRouter()


@router.get("/whoami")
async def whoami(db: AsyncSession = Depends(get_db)) -> dict:
    settings = get_settings()
    state = await get_agent_state(db) if settings.ROLE == "org_agent" else None
    return {
        "role": settings.ROLE,
        "enrolled": state is not None,
        "org_slug": state.org_slug if state else None,
        "org_name": state.org_name if state else None,
        "release_tag": state.release_tag if state else None,
        "core_url": settings.CORE_URL if settings.ROLE == "org_agent" else None,
    }
