"""Поддержка (тикеты). org_admin открывает обращения и ведёт переписку (плавающий
чат), platform_admin обрабатывает их в разделе «Поддержка» ядра. Скоуп орг —
ticket.org_id == admin.org_id. Ответ поддержки рассылается org_admin как
уведомление (services.notifications.notify_ticket_reply)."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import require_org_admin, require_platform_admin
from app.models import OrgAdmin, Organization, SupportMessage, SupportTicket
from app.services.notifications import notify_ticket_reply

router = APIRouter()

_STATUSES = {"open", "pending", "closed"}


class TicketCreate(BaseModel):
    subject: str = Field(min_length=2, max_length=255)
    message: str = Field(min_length=1)


class MessageCreate(BaseModel):
    body: str = Field(min_length=1)


class StatusPatch(BaseModel):
    status: str


def _ticket_dict(t: SupportTicket, org_name: str | None = None) -> dict:
    d = {
        "id": t.id,
        "org_id": t.org_id,
        "subject": t.subject,
        "status": t.status,
        "platform_unread": t.platform_unread,
        "org_unread": t.org_unread,
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "last_message_at": t.last_message_at.isoformat() if t.last_message_at else None,
    }
    if org_name is not None:
        d["org_name"] = org_name
    return d


def _msg_dict(m: SupportMessage) -> dict:
    return {
        "id": m.id,
        "sender_type": m.sender_type,
        "body": m.body,
        "created_at": m.created_at.isoformat() if m.created_at else None,
    }


async def _messages(db: AsyncSession, ticket_id: int) -> list[dict]:
    rows = (
        await db.execute(
            select(SupportMessage)
            .where(SupportMessage.ticket_id == ticket_id)
            .order_by(SupportMessage.created_at.asc(), SupportMessage.id.asc())
        )
    ).scalars().all()
    return [_msg_dict(m) for m in rows]


# ==========================================================================
# org_admin — плавающий чат
# ==========================================================================
@router.get("/tickets", dependencies=[Depends(require_org_admin)])
async def my_tickets(
    admin: OrgAdmin = Depends(require_org_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    rows = (
        await db.execute(
            select(SupportTicket)
            .where(SupportTicket.org_id == admin.org_id)
            .order_by(SupportTicket.last_message_at.desc().nullslast(), SupportTicket.created_at.desc())
        )
    ).scalars().all()
    return {"tickets": [_ticket_dict(t) for t in rows]}


@router.post("/tickets", status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_org_admin)])
async def open_ticket(
    payload: TicketCreate,
    admin: OrgAdmin = Depends(require_org_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    now = datetime.utcnow()
    ticket = SupportTicket(
        org_id=admin.org_id,
        subject=payload.subject.strip(),
        status="open",
        created_by_org_admin_id=admin.id,
        platform_unread=True,
        org_unread=False,
        last_message_at=now,
    )
    db.add(ticket)
    await db.flush()
    db.add(SupportMessage(ticket_id=ticket.id, sender_type="org_admin", sender_id=admin.id, body=payload.message))
    await db.commit()
    return {"id": ticket.id}


async def _get_org_ticket(ticket_id: int, admin: OrgAdmin, db: AsyncSession) -> SupportTicket:
    t = await db.get(SupportTicket, ticket_id)
    if t is None or t.org_id != admin.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "обращение не найдено")
    return t


@router.get("/tickets/{ticket_id}", dependencies=[Depends(require_org_admin)])
async def org_ticket(
    ticket_id: int,
    admin: OrgAdmin = Depends(require_org_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    t = await _get_org_ticket(ticket_id, admin, db)
    msgs = await _messages(db, t.id)
    if t.org_unread:
        t.org_unread = False
        await db.commit()
    return {"ticket": _ticket_dict(t), "messages": msgs}


@router.post("/tickets/{ticket_id}/messages", dependencies=[Depends(require_org_admin)])
async def org_reply(
    ticket_id: int,
    payload: MessageCreate,
    admin: OrgAdmin = Depends(require_org_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    t = await _get_org_ticket(ticket_id, admin, db)
    if t.status == "closed":
        t.status = "open"
    now = datetime.utcnow()
    db.add(SupportMessage(ticket_id=t.id, sender_type="org_admin", sender_id=admin.id, body=payload.body))
    t.platform_unread = True
    t.last_message_at = now
    await db.commit()
    return {"ok": True}


# ==========================================================================
# platform_admin — раздел «Поддержка»
# ==========================================================================
@router.get("/admin/badge", dependencies=[Depends(require_platform_admin)])
async def support_badge(db: AsyncSession = Depends(get_db)) -> dict:
    count = (
        await db.execute(
            select(func.count(SupportTicket.id)).where(SupportTicket.platform_unread.is_(True))
        )
    ).scalar_one()
    return {"count": count}


@router.get("/admin/tickets", dependencies=[Depends(require_platform_admin)])
async def all_tickets(
    status_filter: str | None = None,
    db: AsyncSession = Depends(get_db),
) -> dict:
    q = (
        select(SupportTicket, Organization.name)
        .join(Organization, Organization.id == SupportTicket.org_id)
        .order_by(SupportTicket.last_message_at.desc().nullslast(), SupportTicket.created_at.desc())
    )
    if status_filter in _STATUSES:
        q = q.where(SupportTicket.status == status_filter)
    rows = (await db.execute(q)).all()
    return {"tickets": [_ticket_dict(t, org_name) for t, org_name in rows]}


@router.get("/admin/tickets/{ticket_id}", dependencies=[Depends(require_platform_admin)])
async def admin_ticket(ticket_id: int, db: AsyncSession = Depends(get_db)) -> dict:
    t = await db.get(SupportTicket, ticket_id)
    if t is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "обращение не найдено")
    org = await db.get(Organization, t.org_id)
    msgs = await _messages(db, t.id)
    if t.platform_unread:
        t.platform_unread = False
        await db.commit()
    return {"ticket": _ticket_dict(t, org.name if org else None), "messages": msgs}


@router.post("/admin/tickets/{ticket_id}/messages", dependencies=[Depends(require_platform_admin)])
async def admin_reply(
    ticket_id: int,
    payload: MessageCreate,
    admin=Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    t = await db.get(SupportTicket, ticket_id)
    if t is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "обращение не найдено")
    now = datetime.utcnow()
    db.add(SupportMessage(ticket_id=t.id, sender_type="platform_admin", sender_id=admin.id, body=payload.body))
    t.org_unread = True
    t.last_message_at = now
    if t.status == "open":
        t.status = "pending"
    await notify_ticket_reply(db, t)
    await db.commit()
    return {"ok": True}


@router.patch("/admin/tickets/{ticket_id}", dependencies=[Depends(require_platform_admin)])
async def set_status(ticket_id: int, payload: StatusPatch, db: AsyncSession = Depends(get_db)) -> dict:
    t = await db.get(SupportTicket, ticket_id)
    if t is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "обращение не найдено")
    if payload.status not in _STATUSES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "недопустимый статус")
    t.status = payload.status
    await db.commit()
    return {"id": t.id, "status": t.status}
