from hashlib import sha256
from uuid import uuid4

from fastapi import HTTPException, status
from sqlalchemy import and_, func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time import utc_now
from app.core.config import get_settings
from app.models import Notification, SupportEscalationOutbox, SupportEvent, SupportMessage, SupportParticipant, SupportTicket, User
from app.modules.support.schemas import AdminUnreadOut, AssignCreate, AssigneeOut, EscalateCreate, EscalationDeliveryOut, EventOut, EventPage, MessageCreate, MessageOut, MessagePage, TicketCreate, TicketCreateOut, TicketOut, TicketPage, TicketPatch, UnreadOut


def _body(value: str) -> str:
    value = value.strip()
    if not value:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "message is empty")
    return value


async def _participant(db: AsyncSession, ticket_id: int, kind: str) -> SupportParticipant:
    item = await db.scalar(select(SupportParticipant).where(SupportParticipant.ticket_id == ticket_id, SupportParticipant.kind == kind))
    if item is None:
        raise RuntimeError("support participant missing")
    return item


async def _requester_ticket(db: AsyncSession, user: User, public_id: str) -> SupportTicket:
    ticket = await db.scalar(select(SupportTicket).where(SupportTicket.public_id == public_id, SupportTicket.school_id == user.school_id, SupportTicket.creator_id == user.id))
    if ticket is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Обращение не найдено")
    return ticket


async def _admin_ticket(db: AsyncSession, user: User, public_id: str) -> SupportTicket:
    ticket = await db.scalar(select(SupportTicket).where(SupportTicket.public_id == public_id, SupportTicket.school_id == user.school_id))
    if ticket is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Обращение не найдено")
    return ticket


async def _out(db: AsyncSession, ticket: SupportTicket, kind: str) -> TicketOut:
    participant = await _participant(db, ticket.id, kind)
    unread_sides = ("shared_inbox",) if kind == "requester" else ("requester", "admin_inbox")
    unread_after = True if participant.last_read_message_id is None else or_(SupportMessage.created_at > participant.read_at, and_(SupportMessage.created_at == participant.read_at, SupportMessage.id > participant.last_read_message_id))
    unread = await db.scalar(select(func.count(SupportMessage.id)).where(SupportMessage.ticket_id == ticket.id, SupportMessage.side.in_(unread_sides), unread_after))
    return TicketOut(id=ticket.public_id, correlation_id=ticket.correlation_id, subject=ticket.subject, category=ticket.category, status=ticket.status, priority=ticket.priority, assignee_id=ticket.assignee_id, escalation_status=ticket.escalation_status, version=ticket.version, last_message_at=ticket.last_message_at, unread=bool(unread), created_at=ticket.created_at, updated_at=ticket.updated_at)


async def create_ticket(db: AsyncSession, user: User, data: TicketCreate) -> TicketCreateOut:
    existing = await db.scalar(select(SupportTicket).where(SupportTicket.school_id == user.school_id, SupportTicket.creator_id == user.id, SupportTicket.client_ticket_id == data.client_ticket_id))
    if existing:
        message = await db.scalar(select(SupportMessage).where(SupportMessage.ticket_id == existing.id, SupportMessage.sender_id == user.id, SupportMessage.client_message_id == data.client_message_id))
        if existing.subject != data.subject.strip() or existing.category != data.category or message is None or message.body != _body(data.body):
            raise HTTPException(status.HTTP_409_CONFLICT, "client_ticket_id reused")
        return TicketCreateOut(ticket=await _out(db, existing, "requester"), initial_message=MessageOut.model_validate(message, from_attributes=True), replayed=True)
    now = utc_now()
    ticket = SupportTicket(public_id=str(uuid4()), correlation_id=str(uuid4()), school_id=user.school_id, creator_id=user.id, subject=data.subject.strip(), category=data.category, client_ticket_id=data.client_ticket_id, last_message_at=now, created_at=now, updated_at=now)
    db.add(ticket)
    await db.flush()
    message = SupportMessage(id=str(uuid4()), school_id=user.school_id, ticket_id=ticket.id, sender_id=user.id, client_message_id=data.client_message_id, body=_body(data.body), side="requester", created_at=now)
    db.add(message)
    await db.flush()
    ticket.last_message_id = message.id
    ticket.last_message_side = message.side
    db.add_all([SupportParticipant(school_id=user.school_id, ticket_id=ticket.id, kind="requester", user_id=user.id, last_read_message_id=message.id, read_at=now), SupportParticipant(school_id=user.school_id, ticket_id=ticket.id, kind="shared_inbox"), SupportEvent(id=str(uuid4()), school_id=user.school_id, ticket_id=ticket.id, actor_id=user.id, action="ticket_created", metadata_json={"message_id": message.id}, created_at=now)])
    await db.commit()
    return TicketCreateOut(ticket=await _out(db, ticket, "requester"), initial_message=MessageOut.model_validate(message, from_attributes=True), replayed=False)


async def list_tickets(db: AsyncSession, user: User, admin: bool, limit: int, cursor: int | None) -> TicketPage:
    query = select(SupportTicket).where(SupportTicket.school_id == user.school_id)
    if not admin:
        query = query.where(SupportTicket.creator_id == user.id)
    if cursor:
        query = query.where(SupportTicket.id < cursor)
    rows = list((await db.scalars(query.order_by(SupportTicket.id.desc()).limit(limit + 1))).all())
    kind = "shared_inbox" if admin else "requester"
    return TicketPage(items=[await _out(db, row, kind) for row in rows[:limit]], next_cursor=str(rows[limit - 1].id) if len(rows) > limit else None)


async def get_ticket(db: AsyncSession, user: User, public_id: str, admin: bool) -> TicketOut:
    ticket = await (_admin_ticket(db, user, public_id) if admin else _requester_ticket(db, user, public_id))
    return await _out(db, ticket, "shared_inbox" if admin else "requester")


async def escalation_delivery(db: AsyncSession, user: User, public_id: str) -> EscalationDeliveryOut:
    ticket = await _admin_ticket(db, user, public_id)
    row = await db.scalar(select(SupportEscalationOutbox).where(SupportEscalationOutbox.ticket_id == ticket.id, SupportEscalationOutbox.school_id == user.school_id))
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Доставка эскалации не найдена")
    now = utc_now()
    state = "delivered" if row.status == "delivered" else "retrying" if row.status == "error" or row.attempts > 0 else "pending"
    pending_age = max(0, int((now - row.created_at).total_seconds())) if state != "delivered" else None
    latency = max(0, int((row.delivered_at - row.created_at).total_seconds())) if row.delivered_at is not None else None
    sla = get_settings().SUPPORT_ESCALATION_DELIVERY_SLA_S
    return EscalationDeliveryOut(
        state=state,
        attempts=row.attempts,
        created_at=row.created_at,
        updated_at=row.updated_at,
        next_attempt_at=row.next_attempt_at if state != "delivered" else None,
        delivered_at=row.delivered_at,
        pending_age_seconds=pending_age,
        delivery_latency_seconds=latency,
        sla_seconds=sla,
        sla_breached=pending_age is not None and pending_age >= sla,
    )


async def messages(db: AsyncSession, user: User, public_id: str, admin: bool, before: str | None, limit: int) -> MessagePage:
    ticket = await (_admin_ticket(db, user, public_id) if admin else _requester_ticket(db, user, public_id))
    query = select(SupportMessage).where(SupportMessage.school_id == user.school_id, SupportMessage.ticket_id == ticket.id)
    if not admin:
        query = query.where(SupportMessage.side != "admin_inbox")
    if before:
        marker = await db.scalar(select(SupportMessage).where(SupportMessage.id == before, SupportMessage.ticket_id == ticket.id))
        if marker:
            query = query.where(or_(SupportMessage.created_at < marker.created_at, and_(SupportMessage.created_at == marker.created_at, SupportMessage.id < marker.id)))
    rows = list((await db.scalars(query.order_by(SupportMessage.created_at.desc(), SupportMessage.id.desc()).limit(limit + 1))).all())
    items = list(reversed(rows[:limit]))
    return MessagePage(items=[MessageOut.model_validate(row, from_attributes=True) for row in items], next_cursor=items[0].id if len(rows) > limit else None)


async def send(db: AsyncSession, user: User, public_id: str, data: MessageCreate, admin: bool) -> MessageOut:
    ticket = await (_admin_ticket(db, user, public_id) if admin else _requester_ticket(db, user, public_id))
    body = _body(data.body)
    existing = await db.scalar(select(SupportMessage).where(SupportMessage.ticket_id == ticket.id, SupportMessage.sender_id == user.id, SupportMessage.client_message_id == data.client_message_id))
    if existing:
        if existing.body != body:
            raise HTTPException(status.HTTP_409_CONFLICT, "client_message_id reused")
        return MessageOut.model_validate(existing, from_attributes=True)
    if ticket.status == "closed":
        raise HTTPException(status.HTTP_409_CONFLICT, "ticket is closed")
    now = utc_now()
    side = "shared_inbox" if admin else "requester"
    message = SupportMessage(id=str(uuid4()), school_id=user.school_id, ticket_id=ticket.id, sender_id=user.id, client_message_id=data.client_message_id, body=body, side=side, created_at=now)
    db.add(message)
    await db.flush()
    ticket.last_message_id = message.id
    ticket.last_message_side = side
    ticket.last_message_at = now
    ticket.updated_at = now
    if admin:
        ticket.status = "waiting_requester"
        db.add(Notification(school_id=user.school_id, user_id=ticket.creator_id, title=f"Ответ школы: {ticket.subject}", text=body[:255], type="support", ref_type="school_support_ticket", ref_id=ticket.public_id))
        from app.modules.push.service import enqueue
        await enqueue(db, user.school_id, ticket.creator_id, f"support:{message.id}", "support_reply", f"support_ticket:{ticket.public_id}")
    elif ticket.status in {"waiting_requester", "resolved"}:
        ticket.status = "open"
    db.add(SupportEvent(id=str(uuid4()), school_id=user.school_id, ticket_id=ticket.id, actor_id=user.id, action="message_created", metadata_json={"message_id": message.id, "side": side}, created_at=now))
    await db.commit()
    return MessageOut.model_validate(message, from_attributes=True)


async def mark_read(db: AsyncSession, user: User, public_id: str, message_id: str, client_action_id: str | None, admin: bool) -> None:
    ticket = await (_admin_ticket(db, user, public_id) if admin else _requester_ticket(db, user, public_id))
    message = await db.scalar(select(SupportMessage).where(SupportMessage.id == message_id, SupportMessage.ticket_id == ticket.id, SupportMessage.school_id == user.school_id))
    if message is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Сообщение не найдено")
    kind = "shared_inbox" if admin else "requester"
    fingerprint = {"action": "ticket_read", "actor_id": user.id, "kind": kind, "message_id": message.id}
    if client_action_id is not None:
        existing = await db.scalar(select(SupportEvent).where(SupportEvent.ticket_id == ticket.id, SupportEvent.client_action_id == client_action_id))
        if existing is not None:
            if not isinstance(existing.metadata_json, dict) or existing.metadata_json.get("fingerprint") != fingerprint:
                raise HTTPException(status.HTTP_409_CONFLICT, "client_action_id reused")
            return
    participant = await db.scalar(select(SupportParticipant).where(SupportParticipant.ticket_id == ticket.id, SupportParticipant.kind == kind).with_for_update())
    if participant is None:
        raise RuntimeError("support participant missing")
    advanced = False
    if participant.read_at is None or message.created_at > participant.read_at or message.created_at == participant.read_at and (participant.last_read_message_id is None or message.id > participant.last_read_message_id):
        participant.last_read_message_id = message.id
        participant.read_at = message.created_at
        advanced = True
    if advanced or client_action_id is not None:
        metadata = {"fingerprint": fingerprint} if client_action_id is not None else {"message_id": message.id}
        db.add(SupportEvent(id=str(uuid4()), school_id=user.school_id, ticket_id=ticket.id, actor_id=user.id, action="ticket_read", client_action_id=client_action_id, metadata_json=metadata, created_at=utc_now()))
    if not admin:
        notifications = list((await db.scalars(select(Notification).where(Notification.user_id == user.id, Notification.ref_type == "school_support_ticket", Notification.ref_id == ticket.public_id, Notification.is_read.is_(False)))).all())
        for notification in notifications:
            notification.is_read = True
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        ticket = await (_admin_ticket(db, user, public_id) if admin else _requester_ticket(db, user, public_id))
        existing = await db.scalar(select(SupportEvent).where(SupportEvent.ticket_id == ticket.id, SupportEvent.client_action_id == client_action_id))
        if existing is not None and isinstance(existing.metadata_json, dict) and existing.metadata_json.get("fingerprint") == fingerprint:
            return
        raise HTTPException(status.HTTP_409_CONFLICT, "client_action_id reused")


async def unread(db: AsyncSession, user: User, admin: bool) -> UnreadOut:
    kind = "shared_inbox" if admin else "requester"
    unread_sides = ("requester", "admin_inbox") if admin else ("shared_inbox",)
    query = select(SupportTicket.id, SupportParticipant.last_read_message_id, SupportParticipant.read_at).join(SupportParticipant, SupportParticipant.ticket_id == SupportTicket.id).where(SupportTicket.school_id == user.school_id, SupportParticipant.kind == kind)
    if not admin:
        query = query.where(SupportTicket.creator_id == user.id)
    rows = (await db.execute(query)).all()
    tickets = 0
    messages = 0
    for ticket_id, last_read_message_id, read_at in rows:
        unread_after = True if last_read_message_id is None else or_(SupportMessage.created_at > read_at, and_(SupportMessage.created_at == read_at, SupportMessage.id > last_read_message_id))
        count = await db.scalar(select(func.count(SupportMessage.id)).where(SupportMessage.ticket_id == ticket_id, SupportMessage.side.in_(unread_sides), unread_after))
        if count:
            tickets += 1
            messages += count
    return UnreadOut(tickets=tickets, messages=messages)


async def _replay(db: AsyncSession, ticket: SupportTicket, client_action_id: str, fingerprint: dict) -> TicketOut | None:
    event = await db.scalar(select(SupportEvent).where(SupportEvent.ticket_id == ticket.id, SupportEvent.client_action_id == client_action_id))
    if event is None:
        return None
    if not isinstance(event.metadata_json, dict) or event.metadata_json.get("fingerprint") != fingerprint:
        raise HTTPException(status.HTTP_409_CONFLICT, "client_action_id reused")
    return await _out(db, ticket, "shared_inbox")


async def patch_ticket(db: AsyncSession, user: User, public_id: str, data: TicketPatch) -> TicketOut:
    ticket = await _admin_ticket(db, user, public_id)
    changes = data.model_dump(exclude={"client_action_id", "expected_version"}, exclude_none=True)
    if not changes:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "at least one field is required")
    fingerprint = {"action": "ticket_updated", "expected_version": data.expected_version, "changes": changes}
    replay = await _replay(db, ticket, data.client_action_id, fingerprint)
    if replay:
        return replay
    values = {**changes, "version": data.expected_version + 1, "updated_at": utc_now()}
    if "status" in changes:
        values["closed_at"] = utc_now() if changes["status"] == "closed" else None
    result = await db.execute(update(SupportTicket).where(SupportTicket.id == ticket.id, SupportTicket.school_id == user.school_id, SupportTicket.version == data.expected_version).values(**values))
    if result.rowcount != 1:
        await db.rollback()
        current = await _admin_ticket(db, user, public_id)
        replay = await _replay(db, current, data.client_action_id, fingerprint)
        if replay:
            return replay
        raise HTTPException(status.HTTP_409_CONFLICT, {"code": "VERSION_CONFLICT", "current_version": current.version})
    db.add(SupportEvent(id=str(uuid4()), school_id=user.school_id, ticket_id=ticket.id, actor_id=user.id, action="ticket_updated", client_action_id=data.client_action_id, metadata_json={"fingerprint": fingerprint, "changes": changes}, created_at=utc_now()))
    await db.commit()
    return await _out(db, await _admin_ticket(db, user, public_id), "shared_inbox")


async def assign_ticket(db: AsyncSession, user: User, public_id: str, data: AssignCreate) -> TicketOut:
    ticket = await _admin_ticket(db, user, public_id)
    fingerprint = {"action": "ticket_assigned", "expected_version": data.expected_version, "assignee_id": data.assignee_id}
    replay = await _replay(db, ticket, data.client_action_id, fingerprint)
    if replay:
        return replay
    if data.assignee_id is not None:
        assignee = await db.scalar(select(User).where(User.id == data.assignee_id, User.school_id == user.school_id, User.is_active.is_(True), User.role.in_(("school_admin", "director"))))
        if assignee is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Сотрудник не найден")
    result = await db.execute(update(SupportTicket).where(SupportTicket.id == ticket.id, SupportTicket.school_id == user.school_id, SupportTicket.version == data.expected_version).values(assignee_id=data.assignee_id, version=data.expected_version + 1, updated_at=utc_now()))
    if result.rowcount != 1:
        await db.rollback()
        current = await _admin_ticket(db, user, public_id)
        replay = await _replay(db, current, data.client_action_id, fingerprint)
        if replay:
            return replay
        raise HTTPException(status.HTTP_409_CONFLICT, {"code": "VERSION_CONFLICT", "current_version": current.version})
    db.add(SupportEvent(id=str(uuid4()), school_id=user.school_id, ticket_id=ticket.id, actor_id=user.id, action="ticket_assigned" if data.assignee_id else "ticket_unassigned", client_action_id=data.client_action_id, metadata_json={"fingerprint": fingerprint}, created_at=utc_now()))
    await db.commit()
    return await _out(db, await _admin_ticket(db, user, public_id), "shared_inbox")


async def escalate_ticket(db: AsyncSession, user: User, public_id: str, data: EscalateCreate) -> TicketOut:
    ticket = await _admin_ticket(db, user, public_id)
    summary = _body(data.redacted_summary)
    fingerprint = {"action": "ticket_escalated", "expected_version": data.expected_version, "redacted_summary_sha256": sha256(summary.encode()).hexdigest()}
    replay = await _replay(db, ticket, data.client_action_id, fingerprint)
    if replay:
        return replay
    if ticket.status == "closed":
        raise HTTPException(status.HTTP_409_CONFLICT, "ticket is closed")
    if ticket.escalation_status != "none":
        raise HTTPException(status.HTTP_409_CONFLICT, "ticket already escalated")
    settings = get_settings()
    if not settings.SCHOOL_PUBLIC_ID:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "school public id is not configured")
    now = utc_now()
    result = await db.execute(update(SupportTicket).where(SupportTicket.id == ticket.id, SupportTicket.school_id == user.school_id, SupportTicket.version == data.expected_version, SupportTicket.status != "closed", SupportTicket.escalation_status == "none").values(escalation_status="pending_delivery", escalation_requested_at=now, escalation_requested_by=user.id, version=data.expected_version + 1, updated_at=now))
    if result.rowcount != 1:
        await db.rollback()
        current = await _admin_ticket(db, user, public_id)
        replay = await _replay(db, current, data.client_action_id, fingerprint)
        if replay:
            return replay
        raise HTTPException(status.HTTP_409_CONFLICT, {"code": "VERSION_CONFLICT", "current_version": current.version})
    payload = {
        "school_public_id": settings.SCHOOL_PUBLIC_ID,
        "correlation_id": ticket.correlation_id,
        "tenant_ticket_public_id": ticket.public_id,
        "subject": ticket.subject,
        "message": summary,
        "client_message_id": data.client_action_id,
        "redacted_snapshot": {"category": ticket.category, "priority": ticket.priority, "correlation_id": ticket.correlation_id},
    }
    db.add_all([
        SupportEscalationOutbox(id=str(uuid4()), school_id=user.school_id, ticket_id=ticket.id, payload_json=payload, next_attempt_at=now, created_at=now, updated_at=now),
        SupportEvent(id=str(uuid4()), school_id=user.school_id, ticket_id=ticket.id, actor_id=user.id, action="ticket_escalated", client_action_id=data.client_action_id, metadata_json={"fingerprint": fingerprint}, created_at=now),
    ])
    await db.commit()
    return await _out(db, await _admin_ticket(db, user, public_id), "shared_inbox")


async def assignees(db: AsyncSession, user: User) -> list[AssigneeOut]:
    rows = list((await db.scalars(select(User).where(User.school_id == user.school_id, User.is_active.is_(True), User.role.in_(("school_admin", "director"))).order_by(User.last_name, User.first_name, User.id))).all())
    return [AssigneeOut(id=row.id, name=" ".join(filter(None, (row.first_name, row.last_name))) or row.login, role=row.role) for row in rows]


async def events(db: AsyncSession, user: User, public_id: str, after: str | None, limit: int) -> EventPage:
    ticket = await _admin_ticket(db, user, public_id)
    query = select(SupportEvent).where(SupportEvent.school_id == user.school_id, SupportEvent.ticket_id == ticket.id)
    if after:
        marker = await db.scalar(select(SupportEvent).where(SupportEvent.id == after, SupportEvent.ticket_id == ticket.id))
        if marker:
            query = query.where(or_(SupportEvent.created_at > marker.created_at, and_(SupportEvent.created_at == marker.created_at, SupportEvent.id > marker.id)))
    rows = list((await db.scalars(query.order_by(SupportEvent.created_at, SupportEvent.id).limit(limit + 1))).all())
    return EventPage(items=[EventOut(id=row.id, action=row.action, actor_id=row.actor_id, metadata=row.metadata_json, created_at=row.created_at) for row in rows[:limit]], next_cursor=rows[limit - 1].id if len(rows) > limit else None)


async def admin_unread(db: AsyncSession, user: User) -> AdminUnreadOut:
    base = await unread(db, user, True)
    unassigned = await db.scalar(select(func.count(SupportTicket.id)).where(SupportTicket.school_id == user.school_id, SupportTicket.assignee_id.is_(None), SupportTicket.status != "closed"))
    urgent = await db.scalar(select(func.count(SupportTicket.id)).where(SupportTicket.school_id == user.school_id, SupportTicket.priority == "urgent", SupportTicket.status != "closed"))
    return AdminUnreadOut(tickets=base.tickets, messages=base.messages, unassigned=unassigned or 0, urgent=urgent or 0)
