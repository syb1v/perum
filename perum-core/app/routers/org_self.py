"""Self-service эндпоинты организации, доступные ДАЖЕ когда орг приостановлена за
неоплату. Здесь — только read-only биллинг, чтобы орг видела, что и сколько надо
оплатить (AUDIT, billing #8). Управление школами остаётся за require_org_admin
(который блокирует приостановленную орг).

Добавлены DNS-эндпоинты для org_admin (2026-07-08): просмотр статуса DNS и кнопка
принудительной синхронизации. Раньше DNS был виден только platform_admin."""

from __future__ import annotations

import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import require_org_admin_billing
from app.models import Invoice, Node, OrgAdmin, Organization, School
from app.services.billing import billing_state, get_or_create_subscription, plan_price, school_limit

logger = logging.getLogger("perum.org_self")
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


@router.get("/dns")
async def org_self_dns(
    admin: OrgAdmin = Depends(require_org_admin_billing), db: AsyncSession = Depends(get_db)
) -> dict:
    """DNS-статус организации: CF-автоматизация, записи школ, синхронизация.
    Доступно org_admin своей организации (раньше было только platform_admin)."""
    org = await db.get(Organization, admin.org_id)
    if org is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "организация не найдена")

    from app.services.dns_manager import get_dns_manager

    node = await db.get(Node, org.node_id) if org.node_id else None
    target = node.hostname if node else None

    def _is_ip(v: str | None) -> bool:
        if not v:
            return False
        parts = v.split(".")
        return len(parts) == 4 and all(p.isdigit() and 0 <= int(p) <= 255 for p in parts)

    record_type = "A" if _is_ip(target) else "CNAME"

    dns = get_dns_manager()
    school_records = []
    cf_enabled = dns.is_auto and bool(org.cf_zone_id)
    if cf_enabled:
        try:
            result = await dns.sync_org_dns(org, db)
            school_records = [
                {"name": r.name, "fqdn": r.fqdn, "type": r.type, "content": r.content,
                 "node_name": r.node_name, "cf_record_id": r.cf_record_id, "status": r.status}
                for r in result.records
            ]
        except Exception as exc:
            logger.warning("org %s: DNS sync failed: %s", org.slug, exc)
    elif not cf_enabled:
        result = await dns.manual_records(org, db)
        school_records = [
            {"name": r.name, "fqdn": r.fqdn, "type": r.type, "content": r.content,
             "node_name": r.node_name, "status": "manual"}
            for r in result.records
        ]

    return {
        "domain": org.domain,
        "node_name": node.name if node else None,
        "dns_target": target,
        "record_type": record_type,
        "dns_provider": org.dns_provider,
        "cf_zone_id": org.cf_zone_id,
        "cf_enabled": cf_enabled,
        "school_records": school_records,
    }


@router.post("/dns/sync")
async def org_self_dns_sync(
    admin: OrgAdmin = Depends(require_org_admin_billing), db: AsyncSession = Depends(get_db)
) -> dict:
    """Принудительная синхронизация DNS-записей школ организации с Cloudflare."""
    org = await db.get(Organization, admin.org_id)
    if org is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "организация не найдена")

    from app.services.dns_manager import get_dns_manager

    dns = get_dns_manager()
    if not dns.is_auto:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cloudflare DNS не настроен")
    if not org.cf_zone_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "зона CF не найдена для домена организации")

    result = await dns.sync_org_dns(org, db)
    return {"synced": result.synced, "deleted": result.deleted, "errors": result.errors}
