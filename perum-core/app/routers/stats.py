"""Статистика платформы для platform_admin (R3). Монтируется под /api/platform
с require_platform_admin. Разрезы по орг/школам — из снимков телеметрии."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.services.stats import platform_stats

router = APIRouter()


@router.get("/stats")
async def platform_stats_endpoint(db: AsyncSession = Depends(get_db)) -> dict:
    """Сводка по всей платформе: организации/школы по статусам, суммы пользователей/
    учеников/учителей/оценок/активности, число живых школ + разрез по организациям."""
    return await platform_stats(db, datetime.utcnow())
