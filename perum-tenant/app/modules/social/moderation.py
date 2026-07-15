from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import uuid4

from app.core.time import utc_now
from app.models import User
from app.models.social import Conversation, EvidenceHold, Message, ModerationAuditEvent, ModerationCase, ModerationReport
from app.modules.social.schemas import ModerationActionCreate


async def _case(db: AsyncSession, school_id: int, case_id: int) -> ModerationCase:
    row = await db.scalar(select(ModerationCase).where(ModerationCase.id == case_id, ModerationCase.school_id == school_id))
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "case not found")
    return row


async def inbox(db: AsyncSession, school_id: int, cursor: int | None, limit: int):
    stmt = select(ModerationCase).where(ModerationCase.school_id == school_id)
    if cursor is not None:
        stmt = stmt.where(ModerationCase.id < cursor)
    return (await db.scalars(stmt.order_by(ModerationCase.id.desc()).limit(limit + 1))).all()


async def detail(db: AsyncSession, actor: User, case_id: int):
    case = await _case(db, actor.school_id, case_id)
    report = await db.scalar(select(ModerationReport).where(ModerationReport.id == case.report_id, ModerationReport.school_id == actor.school_id))
    message = await db.scalar(select(Message).where(Message.id == case.reported_message_id, Message.school_id == actor.school_id))
    if report is None or message is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "case not found")
    event = ModerationAuditEvent(school_id=actor.school_id, case_id=case.id, actor_id=actor.id, event_type="content_viewed", client_action_id=f"view:{uuid4()}", expected_version=case.version, resulting_version=case.version)
    db.add(event)
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise
    return {"id": case.id, "status": case.status, "version": case.version, "category": report.category, "comment": report.comment, "created_at": case.created_at, "evidence": [{"message_id": message.id, "sender": "reported", "body": message.body, "created_at": message.created_at}], "other_participant": "participant"}


async def action(db: AsyncSession, actor: User, case_id: int, payload: ModerationActionCreate):
    school_id = actor.school_id
    actor_id = actor.id
    replay = await db.scalar(select(ModerationAuditEvent).where(ModerationAuditEvent.school_id == school_id, ModerationAuditEvent.actor_id == actor_id, ModerationAuditEvent.client_action_id == payload.client_action_id))
    if replay is not None:
        if replay.case_id != case_id or replay.event_type != payload.action or replay.reason != payload.reason or replay.expected_version != payload.expected_version:
            raise HTTPException(status.HTTP_409_CONFLICT, "client_action_id conflict")
        return await _case(db, school_id, case_id)
    case = await _case(db, school_id, case_id)
    conversation = await db.scalar(select(Conversation).where(Conversation.id == case.conversation_id, Conversation.school_id == school_id))
    message = await db.scalar(select(Message).where(Message.id == case.reported_message_id, Message.school_id == school_id))
    if conversation is None or message is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "case not found")
    case_status = "dismissed" if payload.action == "dismiss" else "actioned"
    now = utc_now()
    result = await db.execute(update(ModerationCase).where(ModerationCase.id == case_id, ModerationCase.school_id == school_id, ModerationCase.version == payload.expected_version).values(status=case_status, version=payload.expected_version + 1, updated_at=now))
    if result.rowcount != 1:
        await db.rollback()
        replay = await db.scalar(select(ModerationAuditEvent).where(ModerationAuditEvent.school_id == school_id, ModerationAuditEvent.actor_id == actor_id, ModerationAuditEvent.client_action_id == payload.client_action_id))
        if replay is not None and replay.case_id == case_id and replay.event_type == payload.action and replay.reason == payload.reason and replay.expected_version == payload.expected_version:
            return await _case(db, school_id, case_id)
        raise HTTPException(status.HTTP_409_CONFLICT, "version conflict")
    if payload.action == "dismiss":
        pass
    elif payload.action == "hide_reported_message":
        message.is_visible = False
    elif payload.action == "lock_conversation":
        conversation.is_locked = True
    else:
        conversation.is_locked = False
    db.add(ModerationAuditEvent(school_id=school_id, case_id=case.id, actor_id=actor_id, event_type=payload.action, reason=payload.reason, client_action_id=payload.client_action_id, expected_version=payload.expected_version, resulting_version=payload.expected_version + 1))
    if payload.action == "dismiss":
        for hold in (await db.scalars(select(EvidenceHold).where(EvidenceHold.case_id == case.id, EvidenceHold.school_id == school_id, EvidenceHold.released_at.is_(None)))).all():
            hold.released_at = now
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        replay = await db.scalar(select(ModerationAuditEvent).where(ModerationAuditEvent.school_id == school_id, ModerationAuditEvent.actor_id == actor_id, ModerationAuditEvent.client_action_id == payload.client_action_id))
        if replay is None or replay.case_id != case_id or replay.event_type != payload.action or replay.reason != payload.reason or replay.expected_version != payload.expected_version:
            raise HTTPException(status.HTTP_409_CONFLICT, "client_action_id conflict")
        return await _case(db, school_id, case_id)
    case = await _case(db, school_id, case_id)
    await db.refresh(case)
    if payload.action in {"lock_conversation", "unlock_conversation"}:
        from app.modules.social.realtime import publish_conversation
        await publish_conversation("conversation.changed", school_id, conversation.id, {conversation.user_low_id, conversation.user_high_id}, reason="locked" if payload.action == "lock_conversation" else "unlocked")
    return case
