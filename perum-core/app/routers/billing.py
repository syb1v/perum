"""Биллинг-операции уровня платформы (R2). Под require_platform_admin."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import require_platform_admin
from app.services.billing import outstanding_total, receivables

logger = logging.getLogger("perum.billing")
# Defense-in-depth (#10): гард на самом роутере, не только в main.py.
router = APIRouter(dependencies=[Depends(require_platform_admin)])


@router.post("/enforce")
async def enforce_billing(db: AsyncSession = Depends(get_db)) -> dict:
    """Приостановить организации с просроченной подпиской вручную (то же делает и
    фоновый планировщик). Идемпотентно: берём только active-орг."""
    from app.services.billing import run_billing_enforcement

    return await run_billing_enforcement(db)


@router.get("/receivables")
async def list_receivables(db: AsyncSession = Depends(get_db)) -> dict:
    """Дебиторка платформы: кто и сколько должен (открытые счета). Материализуется
    планировщиком/enforce при просрочке (AUDIT, billing #5)."""
    rows = await receivables(db)
    return {"total_rub": await outstanding_total(db), "organizations": rows}
