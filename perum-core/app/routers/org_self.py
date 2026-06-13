"""Self-service эндпоинты организации, доступные ДАЖЕ когда орг приостановлена за
неоплату. Здесь — только read-only биллинг, чтобы орг видела, что и сколько надо
оплатить (AUDIT, billing #8). Управление школами остаётся за require_org_admin
(который блокирует приостановленную орг)."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import require_org_admin_billing
from app.models import Invoice, OrgAdmin, Organization, School
from app.services.billing import billing_state, get_or_create_subscription, plan_price, school_limit

router = APIRouter()


@router.get("/billing")
async def org_self_billing(
    admin: OrgAdmin = Depends(require_org_admin_billing), db: AsyncSession = Depends(get_db)
) -> dict:
    """План/лимит/подписка/долг своей орг (read-only), доступно и при заморозке."""
    org = await db.get(Organization, admin.org_id)
    if org is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "организация не найдена")
    sub = await get_or_create_subscription(db, org)
    used = int(await db.scalar(
        select(func.count(School.id)).where(School.org_id == org.id, School.status != "archived")
    ) or 0)
    limit = school_limit(org.plan)
    outstanding = int(await db.scalar(
        select(func.coalesce(func.sum(Invoice.amount_rub), 0)).where(
            Invoice.org_id == org.id, Invoice.status == "open"
        )
    ) or 0)
    return {
        "plan": org.plan,
        "price_rub_month": plan_price(org.plan),
        "school_limit": limit,
        "schools_used": used,
        "schools_remaining": max(limit - used, 0),
        "org_status": org.status,
        "outstanding_rub": outstanding,
        "subscription": billing_state(sub, datetime.utcnow()),
    }
