"""Поддержка (тикеты). org_admin открывает обращения и ведёт переписку (плавающий
чат), platform_admin обрабатывает их в разделе «Поддержка» ядра. Скоуп орг —
ticket.org_id == admin.org_id. Ответ поддержки рассылается org_admin как
уведомление (services.notifications.notify_ticket_reply)."""

from __future__ import annotations

import secrets
from datetime import datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import require_org_admin, require_platform_admin
from app.models import OrgAdmin, Organization, School, SchoolSecret, SupportEscalationEvent, SupportMessage, SupportTicket
from app.services.notifications import notify_ticket_reply

router = APIRouter()
internal_router = APIRouter()

_STATUSES = {"open", "pending", "closed"}


class TicketCreate(BaseModel):
    subject: str = Field(min_length=2, max_length=255)
    message: str = Field(min_length=1, max_length=4000)


class MessageCreate(BaseModel):
    body: str = Field(min_length=1, max_length=4000)


class StatusPatch(BaseModel):
    status: str


class EscalationIntake(BaseModel):
    school_public_id: UUID
    correlation_id: str = Field(min_length=1, max_length=128)
    tenant_ticket_public_id: str | None = Field(default=None, max_length=128)
    subject: str = Field(min_length=2, max_length=255)
    message: str = Field(min_length=1, max_length=4000)
    client_message_id: str | None = Field(default=None, max_length=128)
    redacted_snapshot: dict = Field(default_factory=dict)


class EscalationAction(BaseModel):
    client_action_id: str = Field(min_length=1, max_length=128)
    expected_version: int = Field(ge=0)


class OutboundAck(BaseModel):
    school_public_id: UUID
    correlation_id: str = Field(min_length=1, max_length=128)
    cursor: int = Field(ge=0)


def _ticket_dict(t: SupportTicket, org_name: str | None = None) -> dict:
    d = {
        "id": t.id,
        "org_id": t.org_id,
        "source": t.source,
        "school_id": t.school_id,
        "tenant_ticket_public_id": t.tenant_ticket_public_id,
        "correlation_id": t.correlation_id,
        "approval_status": t.approval_status,
        "approval_version": t.approval_version,
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
        "public_id": str(m.public_id),
        "client_message_id": m.client_message_id,
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


def _platform_visible() -> object:
    return or_(SupportTicket.source == "direct", SupportTicket.approval_status == "approved")


async def _authenticate_school(
    db: AsyncSession, school_public_id: UUID, token: str | None
) -> School:
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid internal token")
    school = (await db.execute(select(School).where(School.public_id == school_public_id))).scalar_one_or_none()
    secret = await db.get(SchoolSecret, school.id) if school is not None else None
    valid = bool(token and secret and secret.internal_rpc_token and secrets.compare_digest(secret.internal_rpc_token, token))
    if not valid:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid internal token")
    return school


async def _school_ticket(db: AsyncSession, school: School, correlation_id: str) -> SupportTicket:
    ticket = (
        await db.execute(
            select(SupportTicket).where(
                SupportTicket.source == "school",
                SupportTicket.school_id == school.id,
                SupportTicket.correlation_id == correlation_id,
            )
        )
    ).scalar_one_or_none()
    if ticket is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "escalation not found")
    return ticket


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
            .where(SupportTicket.org_id == admin.org_id, SupportTicket.source == "direct")
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
    if t is None or t.org_id != admin.org_id or t.source != "direct":
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
            .where(_platform_visible())
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
        .where(_platform_visible())
        .order_by(SupportTicket.last_message_at.desc().nullslast(), SupportTicket.created_at.desc())
    )
    if status_filter in _STATUSES:
        q = q.where(SupportTicket.status == status_filter)
    rows = (await db.execute(q)).all()
    return {"tickets": [_ticket_dict(t, org_name) for t, org_name in rows]}


@router.get("/admin/tickets/{ticket_id}", dependencies=[Depends(require_platform_admin)])
async def admin_ticket(ticket_id: int, db: AsyncSession = Depends(get_db)) -> dict:
    t = await db.get(SupportTicket, ticket_id)
    if t is None or not (t.source == "direct" or t.approval_status == "approved"):
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
    if t is None or not (t.source == "direct" or t.approval_status == "approved"):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "обращение не найдено")
    now = datetime.utcnow()
    db.add(SupportMessage(ticket_id=t.id, sender_type="platform_admin", sender_id=admin.id, body=payload.body))
    t.org_unread = t.source == "direct"
    t.last_message_at = now
    if t.status == "open":
        t.status = "pending"
    if t.source == "direct":
        await notify_ticket_reply(db, t)
    await db.commit()
    return {"ok": True}


@router.patch("/admin/tickets/{ticket_id}", dependencies=[Depends(require_platform_admin)])
async def set_status(ticket_id: int, payload: StatusPatch, db: AsyncSession = Depends(get_db)) -> dict:
    t = await db.get(SupportTicket, ticket_id)
    if t is None or not (t.source == "direct" or t.approval_status == "approved"):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "обращение не найдено")
    if payload.status not in _STATUSES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "недопустимый статус")
    t.status = payload.status
    await db.commit()
    return {"id": t.id, "status": t.status}


@internal_router.post("/escalations", status_code=status.HTTP_201_CREATED)
async def intake_escalation(
    payload: EscalationIntake,
    x_internal_token: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
) -> dict:
    school = await _authenticate_school(db, payload.school_public_id, x_internal_token)
    await db.execute(select(School.id).where(School.id == school.id).with_for_update())
    existing = (
        await db.execute(
            select(SupportTicket).where(
                SupportTicket.source == "school",
                SupportTicket.school_id == school.id,
                SupportTicket.correlation_id == payload.correlation_id,
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        first = (
            await db.execute(
                select(SupportMessage)
                .where(SupportMessage.ticket_id == existing.id)
                .order_by(SupportMessage.id)
                .limit(1)
            )
        ).scalar_one()
        exact = (
            existing.tenant_ticket_public_id == payload.tenant_ticket_public_id
            and existing.subject == payload.subject.strip()
            and existing.redacted_snapshot == payload.redacted_snapshot
            and first.body == payload.message
            and first.client_message_id == payload.client_message_id
        )
        if not exact:
            raise HTTPException(status.HTTP_409_CONFLICT, "correlation id already used")
        return {"id": existing.id, "approval_status": existing.approval_status, "version": existing.approval_version}
    now = datetime.utcnow()
    ticket = SupportTicket(
        org_id=school.org_id,
        source="school",
        school_id=school.id,
        tenant_ticket_public_id=payload.tenant_ticket_public_id,
        correlation_id=payload.correlation_id,
        redacted_snapshot=payload.redacted_snapshot,
        approval_status="pending",
        subject=payload.subject.strip(),
        status="open",
        platform_unread=False,
        org_unread=False,
        last_message_at=now,
    )
    db.add(ticket)
    await db.flush()
    message = SupportMessage(
        ticket_id=ticket.id,
        sender_type="school",
        body=payload.message,
        client_message_id=payload.client_message_id,
    )
    db.add(message)
    await db.commit()
    return {"id": ticket.id, "approval_status": "pending", "version": 0}


@internal_router.get("/escalations/outbound")
async def outbound_escalation(
    school_public_id: UUID,
    correlation_id: str = Query(min_length=1, max_length=128),
    since_cursor: int = Query(default=0, ge=0),
    x_internal_token: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
) -> dict:
    school = await _authenticate_school(db, school_public_id, x_internal_token)
    ticket = await _school_ticket(db, school, correlation_id)
    rows = (
        await db.execute(
            select(SupportMessage).where(
                SupportMessage.ticket_id == ticket.id,
                SupportMessage.sender_type == "platform_admin",
                SupportMessage.id > since_cursor,
            ).order_by(SupportMessage.id)
        )
    ).scalars().all()
    return {
        "approval_status": ticket.approval_status,
        "status": ticket.status,
        "version": ticket.approval_version,
        "messages": [_msg_dict(message) for message in rows],
        "cursor": rows[-1].id if rows else since_cursor,
    }


@internal_router.post("/escalations/outbound/ack")
async def ack_outbound(
    payload: OutboundAck,
    x_internal_token: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
) -> dict:
    school = await _authenticate_school(db, payload.school_public_id, x_internal_token)
    ticket = await _school_ticket(db, school, payload.correlation_id)
    max_cursor = (
        await db.execute(
            select(func.max(SupportMessage.id)).where(
                SupportMessage.ticket_id == ticket.id,
                SupportMessage.sender_type == "platform_admin",
            )
        )
    ).scalar_one()
    if payload.cursor and (max_cursor is None or payload.cursor > max_cursor):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "invalid cursor")
    ticket.outbound_ack_cursor = max(ticket.outbound_ack_cursor or 0, payload.cursor)
    await db.commit()
    return {"ok": True, "cursor": ticket.outbound_ack_cursor}


@router.get("/escalations/pending", dependencies=[Depends(require_org_admin)])
async def pending_escalations(
    admin: OrgAdmin = Depends(require_org_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    rows = (
        await db.execute(
            select(SupportTicket).where(
                SupportTicket.org_id == admin.org_id,
                SupportTicket.source == "school",
                SupportTicket.approval_status == "pending",
            ).order_by(SupportTicket.created_at)
        )
    ).scalars().all()
    return {"tickets": [_ticket_dict(ticket) for ticket in rows]}


@router.get("/escalations/{ticket_id}", dependencies=[Depends(require_org_admin)])
async def escalation_detail(
    ticket_id: int,
    full: bool = False,
    limit: int = Query(default=50, ge=1, le=200),
    admin: OrgAdmin = Depends(require_org_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    ticket = await db.get(SupportTicket, ticket_id)
    if ticket is None or ticket.org_id != admin.org_id or ticket.source != "school":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "escalation not found")
    query = select(SupportMessage).where(SupportMessage.ticket_id == ticket.id).order_by(SupportMessage.id)
    if not full:
        query = query.limit(limit)
    messages = (await db.execute(query)).scalars().all()
    result = _ticket_dict(ticket)
    result["redacted_snapshot"] = ticket.redacted_snapshot
    return {"ticket": result, "messages": [_msg_dict(message) for message in messages]}


async def _decide_escalation(
    ticket_id: int,
    action: Literal["approved", "rejected"],
    payload: EscalationAction,
    admin: OrgAdmin,
    db: AsyncSession,
) -> dict:
    existing_event = (
        await db.execute(
            select(SupportEscalationEvent)
            .join(SupportTicket, SupportTicket.id == SupportEscalationEvent.ticket_id)
            .where(
                SupportEscalationEvent.ticket_id == ticket_id,
                SupportEscalationEvent.client_action_id == payload.client_action_id,
                SupportTicket.org_id == admin.org_id,
                SupportTicket.source == "school",
            )
        )
    ).scalar_one_or_none()
    if existing_event is not None:
        if existing_event.org_admin_id != admin.id or existing_event.action != action:
            raise HTTPException(status.HTTP_409_CONFLICT, "client action id already used")
        return {"id": ticket_id, "approval_status": action, "version": existing_event.to_version}
    now = datetime.utcnow()
    values = {
        "approval_status": action,
        "approval_version": payload.expected_version + 1,
        "platform_unread": action == "approved",
        "approved_by_org_admin_id": admin.id if action == "approved" else None,
        "approved_at": now if action == "approved" else None,
        "rejected_by_org_admin_id": admin.id if action == "rejected" else None,
        "rejected_at": now if action == "rejected" else None,
    }
    result = await db.execute(
        update(SupportTicket)
        .where(
            SupportTicket.id == ticket_id,
            SupportTicket.org_id == admin.org_id,
            SupportTicket.source == "school",
            SupportTicket.approval_status == "pending",
            SupportTicket.approval_version == payload.expected_version,
        )
        .values(**values)
    )
    if result.rowcount != 1:
        await db.rollback()
        ticket = await db.get(SupportTicket, ticket_id)
        if ticket is None or ticket.org_id != admin.org_id or ticket.source != "school":
            raise HTTPException(status.HTTP_404_NOT_FOUND, "escalation not found")
        raise HTTPException(status.HTTP_409_CONFLICT, "approval version conflict")
    db.add(SupportEscalationEvent(
        ticket_id=ticket_id,
        org_admin_id=admin.id,
        action=action,
        client_action_id=payload.client_action_id,
        from_version=payload.expected_version,
        to_version=payload.expected_version + 1,
    ))
    await db.commit()
    return {"id": ticket_id, "approval_status": action, "version": payload.expected_version + 1}


@router.post("/escalations/{ticket_id}/approve", dependencies=[Depends(require_org_admin)])
async def approve_escalation(
    ticket_id: int,
    payload: EscalationAction,
    admin: OrgAdmin = Depends(require_org_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    return await _decide_escalation(ticket_id, "approved", payload, admin, db)


@router.post("/escalations/{ticket_id}/reject", dependencies=[Depends(require_org_admin)])
async def reject_escalation(
    ticket_id: int,
    payload: EscalationAction,
    admin: OrgAdmin = Depends(require_org_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    return await _decide_escalation(ticket_id, "rejected", payload, admin, db)
