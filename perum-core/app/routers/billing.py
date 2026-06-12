"""Биллинг-операции уровня платформы (R2). Под require_platform_admin."""

from __future__ import annotations

import logging
from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.models import Organization, School
from app.services.billing import get_or_create_subscription, is_delinquent
from app.services.school_provisioner import suspend_school

logger = logging.getLogger("perum.billing")
router = APIRouter()


@router.post("/enforce")
async def enforce_billing(db: AsyncSession = Depends(get_db)) -> dict:
    """Приостановить организации с просроченной подпиской (их школьные стеки
    останавливаются, тома сохраняются). Планировщика в ядре нет — endpoint
    запускает platform_admin вручную или внешний cron. Идемпотентно: уже
    приостановленные орг не трогаются (берём только active)."""
    now = datetime.utcnow()
    orgs = (await db.execute(select(Organization).where(Organization.status == "active"))).scalars().all()
    suspended: list[str] = []
    for org in orgs:
        sub = await get_or_create_subscription(db, org)
        if not is_delinquent(sub, now):
            continue
        schools = (await db.execute(select(School).where(School.org_id == org.id))).scalars().all()
        for s in schools:
            if s.status == "active":
                try:
                    await suspend_school(s, db, reason="org")
                except Exception as exc:  # noqa: BLE001
                    logger.error("billing enforce: suspend school %s failed: %s", s.slug, exc)
        org.status = "suspended"
        org.suspended_at = now
        sub.status = "past_due"
        sub.updated_at = now
        await db.commit()
        suspended.append(org.slug)
        logger.info("billing enforce: suspended org %s (delinquent)", org.slug)
    return {"checked": len(orgs), "suspended": suspended}
