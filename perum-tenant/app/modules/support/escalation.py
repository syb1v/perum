import asyncio
import logging
from datetime import datetime, timedelta
from uuid import uuid4

import httpx
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.core.config import get_settings
from app.core.db import SessionLocal
from app.core.time import utc_now
from app.models import Notification, SupportEscalationOutbox, SupportEscalationReceipt, SupportEvent, SupportMessage, SupportTicket, User

logger = logging.getLogger("perum.tenant.support.escalation")


def _headers() -> dict[str, str]:
    return {"x-internal-token": get_settings().INTERNAL_RPC_TOKEN}


async def deliver_outbox(client: httpx.AsyncClient) -> None:
    now = utc_now()
    async with SessionLocal() as db:
        rows = list((await db.scalars(select(SupportEscalationOutbox).where(SupportEscalationOutbox.status.in_(("pending", "error")), SupportEscalationOutbox.next_attempt_at <= now).order_by(SupportEscalationOutbox.created_at).limit(20))).all())
        ids = [row.id for row in rows]
    for outbox_id in ids:
        async with SessionLocal() as db:
            row = await db.get(SupportEscalationOutbox, outbox_id)
            if row is None or row.status not in {"pending", "error"} or row.next_attempt_at > utc_now():
                continue
            ticket = await db.get(SupportTicket, row.ticket_id)
            try:
                response = await client.post(f"{get_settings().CONTROL_PLANE_URL.rstrip('/')}/internal/support/escalations", json=row.payload_json, headers=_headers())
                response.raise_for_status()
                result = response.json()
                row.status = "delivered"
                row.attempts += 1
                row.last_error = None
                row.delivered_at = utc_now()
                row.updated_at = row.delivered_at
                ticket.core_ticket_id = result["id"]
                ticket.escalation_status = {"pending": "pending_org_approval", "approved": "approved", "rejected": "rejected"}.get(result["approval_status"], "pending_org_approval")
                db.add(SupportEvent(id=str(uuid4()), school_id=ticket.school_id, ticket_id=ticket.id, action="escalation_delivered", metadata_json={"status": ticket.escalation_status}, created_at=utc_now()))
            except (httpx.HTTPError, KeyError, ValueError) as exc:
                row.status = "error"
                row.attempts += 1
                row.last_error = str(exc)[:2000]
                row.updated_at = utc_now()
                row.next_attempt_at = row.updated_at + timedelta(seconds=min(300, 2 ** min(row.attempts, 8)))
                ticket.escalation_status = "delivery_error"
            await db.commit()


def _created_at(value: str | None) -> datetime:
    if not value:
        return utc_now()
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return parsed.replace(tzinfo=None)


async def pull_ticket(client: httpx.AsyncClient, ticket_id: int) -> None:
    settings = get_settings()
    async with SessionLocal() as db:
        ticket = await db.get(SupportTicket, ticket_id)
        if ticket is None:
            return
        response = await client.get(
            f"{settings.CONTROL_PLANE_URL.rstrip('/')}/internal/support/escalations/outbound",
            params={"school_public_id": settings.SCHOOL_PUBLIC_ID, "correlation_id": ticket.correlation_id, "since_cursor": ticket.last_core_message_cursor},
            headers=_headers(),
        )
        response.raise_for_status()
        payload = response.json()
        status_value = {"pending": "pending_org_approval", "approved": "approved", "rejected": "rejected"}.get(payload["approval_status"], ticket.escalation_status)
        status_changed = status_value != ticket.escalation_status
        ticket.escalation_status = status_value
        for item in payload.get("messages", []):
            core_message_id = int(item["id"])
            receipt = await db.scalar(select(SupportEscalationReceipt).where(SupportEscalationReceipt.ticket_id == ticket.id, SupportEscalationReceipt.core_message_id == core_message_id))
            if receipt is not None:
                continue
            now = _created_at(item.get("created_at"))
            message = SupportMessage(id=str(uuid4()), school_id=ticket.school_id, ticket_id=ticket.id, sender_id=None, client_message_id=f"core-{core_message_id}", body=item["body"], side="admin_inbox", sender_snapshot="organization_support", created_at=now)
            db.add(message)
            await db.flush()
            db.add_all([
                SupportEscalationReceipt(id=str(uuid4()), school_id=ticket.school_id, ticket_id=ticket.id, core_message_id=core_message_id, message_id=message.id, created_at=utc_now()),
                SupportEvent(id=str(uuid4()), school_id=ticket.school_id, ticket_id=ticket.id, action="organization_reply_received", metadata_json={"message_id": message.id}, created_at=utc_now()),
            ])
            operator_ids = list((await db.scalars(select(User.id).where(User.school_id == ticket.school_id, User.role.in_(("school_admin", "director")), User.is_active.is_(True)))).all())
            db.add_all([
                Notification(
                    school_id=ticket.school_id,
                    user_id=user_id,
                    title=f"Ответ организации: {ticket.subject}",
                    text=item["body"][:255],
                    type="support",
                    ref_type="admin_support_ticket",
                    ref_id=ticket.public_id,
                    created_at=now,
                )
                for user_id in operator_ids
            ])
            ticket.last_message_id = message.id
            ticket.last_message_side = "admin_inbox"
            ticket.last_message_at = now
            ticket.updated_at = utc_now()
        cursor = int(payload.get("cursor", ticket.last_core_message_cursor))
        ticket.last_core_message_cursor = max(ticket.last_core_message_cursor, cursor)
        if status_changed:
            db.add(SupportEvent(id=str(uuid4()), school_id=ticket.school_id, ticket_id=ticket.id, action="escalation_status_changed", metadata_json={"status": status_value}, created_at=utc_now()))
        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
            return
    ack = await client.post(
        f"{settings.CONTROL_PLANE_URL.rstrip('/')}/internal/support/escalations/outbound/ack",
        json={"school_public_id": settings.SCHOOL_PUBLIC_ID, "correlation_id": ticket.correlation_id, "cursor": cursor},
        headers=_headers(),
    )
    ack.raise_for_status()


async def pull_outbound(client: httpx.AsyncClient) -> None:
    async with SessionLocal() as db:
        ticket_ids = list((await db.scalars(select(SupportTicket.id).where(SupportTicket.core_ticket_id.is_not(None), SupportTicket.escalation_status.in_(("pending_org_approval", "approved", "rejected"))))).all())
    for ticket_id in ticket_ids:
        try:
            await pull_ticket(client, ticket_id)
        except (httpx.HTTPError, KeyError, ValueError) as exc:
            logger.warning("support escalation pull failed for ticket %s: %s", ticket_id, exc)


async def escalation_loop() -> None:
    settings = get_settings()
    async with httpx.AsyncClient(timeout=10.0) as client:
        while True:
            try:
                await deliver_outbox(client)
                await pull_outbound(client)
            except Exception:
                logger.exception("support escalation loop failed")
            await asyncio.sleep(settings.SUPPORT_ESCALATION_INTERVAL_S)
