import asyncio
import logging

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import SessionLocal
from app.core.time import utc_now
from app.models.social import Conversation, ConversationMember, EvidenceHold, Message

logger = logging.getLogger("perum.tenant.social.retention")


async def delete_expired_batch(db: AsyncSession, batch_size: int = 500) -> int:
    now = utc_now()
    held = select(EvidenceHold.message_id).where(EvidenceHold.released_at.is_(None))
    stmt = select(Message.id).where(Message.expires_at <= now, Message.id.not_in(held)).order_by(Message.id).limit(batch_size)
    if db.bind is not None and db.bind.dialect.name == "postgresql":
        stmt = stmt.with_for_update(skip_locked=True)
    ids = list((await db.scalars(stmt)).all())
    if not ids:
        return 0
    conversation_ids = list((await db.scalars(select(Message.conversation_id).where(Message.id.in_(ids)).distinct())).all())
    await db.execute(delete(Message).where(Message.id.in_(ids)))
    for conversation_id in conversation_ids:
        last = (await db.execute(select(Message.id, Message.created_at).where(Message.conversation_id == conversation_id).order_by(Message.id.desc()).limit(1))).first()
        conversation = await db.get(Conversation, conversation_id)
        if conversation is not None:
            conversation.last_message_id = last.id if last else None
            conversation.last_message_at = last.created_at if last else None
        maximum = await db.scalar(select(func.max(Message.id)).where(Message.conversation_id == conversation_id))
        cursor_filter = ConversationMember.last_read_message_id.is_not(None) if maximum is None else ConversationMember.last_read_message_id > maximum
        for member in (await db.scalars(select(ConversationMember).where(ConversationMember.conversation_id == conversation_id, cursor_filter))).all():
            member.last_read_message_id = maximum
    await db.commit()
    return len(ids)


async def retention_loop(interval_seconds: int, batch_size: int):
    while True:
        total = 0
        async with SessionLocal() as db:
            while True:
                count = await delete_expired_batch(db, batch_size)
                total += count
                if count < batch_size:
                    break
        logger.info("social retention completed deleted=%s", total)
        await asyncio.sleep(interval_seconds)
