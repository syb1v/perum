"""Уведомления организатора (колокол + всплывашки). Скоуп — текущий org_admin
из токена. Источники строк — news/support (создаются в services.notifications)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import require_org_admin
from app.models import Notification, OrgAdmin

router = APIRouter(dependencies=[Depends(require_org_admin)])


def _to_dict(n: Notification) -> dict:
    return {
        "id": n.id,
        "type": n.type,
        "title": n.title,
        "body": n.body,
        "ref_id": n.ref_id,
        "is_read": n.is_read,
        "created_at": n.created_at.isoformat() if n.created_at else None,
    }


@router.get("")
async def list_notifications(
    unread_only: bool = False,
    limit: int = 30,
    admin: OrgAdmin = Depends(require_org_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    q = select(Notification).where(Notification.org_admin_id == admin.id)
    if unread_only:
        q = q.where(Notification.is_read.is_(False))
    q = q.order_by(Notification.created_at.desc()).limit(min(max(limit, 1), 100))
    rows = (await db.execute(q)).scalars().all()
    return {"notifications": [_to_dict(n) for n in rows]}


@router.get("/unread-count")
async def unread_count(
    admin: OrgAdmin = Depends(require_org_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    count = (
        await db.execute(
            select(func.count(Notification.id)).where(
                Notification.org_admin_id == admin.id, Notification.is_read.is_(False)
            )
        )
    ).scalar_one()
    return {"count": count}


@router.post("/{notif_id}/read")
async def mark_read(
    notif_id: int,
    admin: OrgAdmin = Depends(require_org_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    n = await db.get(Notification, notif_id)
    if n is None or n.org_admin_id != admin.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "уведомление не найдено")
    n.is_read = True
    await db.commit()
    return {"id": n.id, "is_read": True}


@router.post("/read-all")
async def mark_all_read(
    admin: OrgAdmin = Depends(require_org_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    await db.execute(
        update(Notification)
        .where(Notification.org_admin_id == admin.id, Notification.is_read.is_(False))
        .values(is_read=True)
    )
    await db.commit()
    return {"ok": True}
