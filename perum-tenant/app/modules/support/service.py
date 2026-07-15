from uuid import uuid4

from fastapi import HTTPException, status
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time import utc_now
from app.models import Notification, SupportEvent, SupportMessage, SupportParticipant, SupportTicket, User
from app.modules.support.schemas import MessageCreate, MessageOut, MessagePage, TicketCreate, TicketCreateOut, TicketOut, TicketPage, UnreadOut


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
    unread_side = "shared_inbox" if kind == "requester" else "requester"
    unread_after = True if participant.last_read_message_id is None else or_(SupportMessage.created_at > participant.read_at, and_(SupportMessage.created_at == participant.read_at, SupportMessage.id > participant.last_read_message_id))
    unread = await db.scalar(select(func.count(SupportMessage.id)).where(SupportMessage.ticket_id == ticket.id, SupportMessage.side == unread_side, unread_after))
    return TicketOut(id=ticket.public_id, correlation_id=ticket.correlation_id, subject=ticket.subject, category=ticket.category, status=ticket.status, priority=ticket.priority, version=ticket.version, last_message_at=ticket.last_message_at, unread=bool(unread), created_at=ticket.created_at, updated_at=ticket.updated_at)


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
    db.add_all([SupportParticipant(school_id=user.school_id, ticket_id=ticket.id, kind="requester", user_id=user.id, last_read_message_id=message.id, read_at=now), SupportParticipant(school_id=user.school_id, ticket_id=ticket.id, kind="shared_inbox"), SupportEvent(id=str(uuid4()), school_id=user.school_id, ticket_id=ticket.id, actor_id=user.id, action="ticket_created", metadata_json={"message_id": message.id})])
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


async def messages(db: AsyncSession, user: User, public_id: str, admin: bool, before: str | None, limit: int) -> MessagePage:
    ticket = await (_admin_ticket(db, user, public_id) if admin else _requester_ticket(db, user, public_id))
    query = select(SupportMessage).where(SupportMessage.school_id == user.school_id, SupportMessage.ticket_id == ticket.id)
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
    elif ticket.status in {"waiting_requester", "resolved"}:
        ticket.status = "open"
    db.add(SupportEvent(id=str(uuid4()), school_id=user.school_id, ticket_id=ticket.id, actor_id=user.id, action="message_created", metadata_json={"message_id": message.id, "side": side}))
    await db.commit()
    return MessageOut.model_validate(message, from_attributes=True)


async def mark_read(db: AsyncSession, user: User, public_id: str, message_id: str, admin: bool) -> None:
    ticket = await (_admin_ticket(db, user, public_id) if admin else _requester_ticket(db, user, public_id))
    message = await db.scalar(select(SupportMessage).where(SupportMessage.id == message_id, SupportMessage.ticket_id == ticket.id, SupportMessage.school_id == user.school_id))
    if message is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Сообщение не найдено")
    participant = await _participant(db, ticket.id, "shared_inbox" if admin else "requester")
    if participant.read_at is None or message.created_at > participant.read_at or message.created_at == participant.read_at and (participant.last_read_message_id is None or message.id > participant.last_read_message_id):
        participant.last_read_message_id = message.id
        participant.read_at = message.created_at
        db.add(SupportEvent(id=str(uuid4()), school_id=user.school_id, ticket_id=ticket.id, actor_id=user.id, action="ticket_read", metadata_json={"message_id": message.id}))
    if not admin:
        notifications = list((await db.scalars(select(Notification).where(Notification.user_id == user.id, Notification.ref_type == "school_support_ticket", Notification.ref_id == ticket.public_id, Notification.is_read.is_(False)))).all())
        for notification in notifications:
            notification.is_read = True
    await db.commit()


async def unread(db: AsyncSession, user: User, admin: bool) -> UnreadOut:
    kind = "shared_inbox" if admin else "requester"
    unread_side = "requester" if admin else "shared_inbox"
    query = select(SupportTicket.id, SupportParticipant.last_read_message_id, SupportParticipant.read_at).join(SupportParticipant, SupportParticipant.ticket_id == SupportTicket.id).where(SupportTicket.school_id == user.school_id, SupportParticipant.kind == kind)
    if not admin:
        query = query.where(SupportTicket.creator_id == user.id)
    rows = (await db.execute(query)).all()
    tickets = 0
    messages = 0
    for ticket_id, last_read_message_id, read_at in rows:
        unread_after = True if last_read_message_id is None else or_(SupportMessage.created_at > read_at, and_(SupportMessage.created_at == read_at, SupportMessage.id > last_read_message_id))
        count = await db.scalar(select(func.count(SupportMessage.id)).where(SupportMessage.ticket_id == ticket_id, SupportMessage.side == unread_side, unread_after))
        if count:
            tickets += 1
            messages += count
    return UnreadOut(tickets=tickets, messages=messages)
