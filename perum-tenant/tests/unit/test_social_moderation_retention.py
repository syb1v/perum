import asyncio
from datetime import datetime, timedelta

import pytest
from fastapi import HTTPException
from sqlalchemy import func, select

from app.core.time import utc_now
from app.models import User
from app.models.social import ConversationMember, EvidenceHold, Message, ModerationAuditEvent, ModerationCase
from app.modules.social import moderation, retention, service
from app.modules.social.schemas import ModerationActionCreate, ModerationActionOut, ModerationCaseDetailOut, ModerationCasePageOut, ReportCreate
from tests.unit.test_social_messages import seed


def test_moderation_receipt_rejects_unknown_state_and_fields():
    with pytest.raises(ValueError):
        ModerationActionOut(id=1, status="unknown", version=2, updated_at=datetime.now())
    with pytest.raises(ValueError):
        ModerationActionOut(id=1, status="dismissed", version=2, updated_at=datetime.now(), leaked=True)


def test_report_case_action_lock_replay_and_tombstone():
    async def run():
        engine, db, users, school = await seed()
        try:
            admin = User(school_id=school.id, role="school_admin", login="admin", password_hash="x")
            db.add(admin)
            await db.commit()
            conversation = await service.create_conversation(db, users[0], users[1].id)
            message = await service.send_message(db, users[1], conversation.id, "reported", "evidence")
            report = await service.create_report(db, users[0], ReportCreate(message_id=message.id, category="bullying", comment="context", client_report_id="report-1"))
            assert (await service.create_report(db, users[0], ReportCreate(message_id=message.id, category="bullying", comment="context", client_report_id="report-1"))).id == report.id
            case = await db.scalar(select(ModerationCase).where(ModerationCase.report_id == report.id))
            case_id = case.id
            rows = await moderation.inbox(db, school.id, None, 20)
            assert [row.id for row in rows] == [case.id]
            page = {"items": [{"id": row.id, "status": row.status, "version": row.version, "created_at": row.created_at, "updated_at": row.updated_at} for row in rows], "next_cursor": None}
            assert ModerationCasePageOut.model_validate(page).items[0].version == 1
            detail = await moderation.detail(db, admin, case.id)
            assert ModerationCaseDetailOut.model_validate(detail).evidence[0].sender == "reported"
            assert detail["evidence"][0]["body"] == "evidence"
            assert detail["other_participant"] == "participant"
            assert await db.scalar(select(func.count(ModerationAuditEvent.id)).where(ModerationAuditEvent.event_type == "content_viewed")) == 1
            payload = ModerationActionCreate(action="lock_conversation", reason="safety", client_action_id="action-1", expected_version=1)
            actioned = await moderation.action(db, admin, case.id, payload)
            receipt = {"id": actioned.id, "status": actioned.status, "version": actioned.version, "updated_at": actioned.updated_at}
            assert ModerationActionOut.model_validate(receipt).version == 2
            assert (await moderation.action(db, admin, case.id, payload)).version == 2
            assert (await service.send_message(db, users[1], conversation.id, "reported", "evidence")).id == message.id
            with pytest.raises(HTTPException) as locked:
                await service.send_message(db, users[1], conversation.id, "new", "blocked")
            assert locked.value.status_code == 403
            hide = ModerationActionCreate(action="hide_reported_message", reason="confirmed", client_action_id="action-2", expected_version=2)
            await moderation.action(db, admin, case.id, hide)
            await db.refresh(message)
            assert message.is_visible is False
            assert (await db.scalar(select(EvidenceHold).where(EvidenceHold.case_id == case.id))).released_at is None
            with pytest.raises(HTTPException) as stale:
                await moderation.action(db, admin, case.id, ModerationActionCreate(action="dismiss", reason="x", client_action_id="action-3", expected_version=2))
            assert stale.value.status_code == 409
            await db.refresh(admin)
            dismissed = await moderation.action(db, admin, case_id, ModerationActionCreate(action="dismiss", reason="closed", client_action_id="action-4", expected_version=3))
            assert dismissed.version == 4
            assert (await db.scalar(select(EvidenceHold).where(EvidenceHold.case_id == case_id))).released_at is not None
        finally:
            await db.close()
            await engine.dispose()
    asyncio.run(run())


def test_retention_holds_then_deletes_and_repairs_without_forward_cursor():
    async def run():
        engine, db, users, _ = await seed()
        try:
            conversation = await service.create_conversation(db, users[0], users[1].id)
            first = await service.send_message(db, users[0], conversation.id, "first", "first")
            second = await service.send_message(db, users[0], conversation.id, "second", "second")
            first.expires_at = utc_now() - timedelta(days=1)
            second.expires_at = utc_now() - timedelta(days=1)
            member = await db.scalar(select(ConversationMember).where(ConversationMember.conversation_id == conversation.id, ConversationMember.user_id == users[1].id))
            member.last_read_message_id = second.id
            db.add(EvidenceHold(school_id=conversation.school_id, case_id=999, message_id=first.id, release_at=utc_now() + timedelta(days=1)))
            await db.commit()
            hold = await db.scalar(select(EvidenceHold).where(EvidenceHold.message_id == first.id))
            hold.release_at = utc_now() - timedelta(days=100)
            await db.commit()
            assert await retention.delete_expired_batch(db, 10) == 1
            assert await db.get(Message, first.id) is not None
            assert await db.get(Message, second.id) is None
            await db.refresh(conversation)
            await db.refresh(member)
            assert conversation.last_message_id == first.id
            assert member.last_read_message_id == first.id
            hold.released_at = utc_now()
            await db.commit()
            assert await retention.delete_expired_batch(db, 10) == 1
            assert await retention.delete_expired_batch(db, 10) == 0
            await db.refresh(conversation)
            await db.refresh(member)
            assert conversation.last_message_id is None
            assert member.last_read_message_id is None
        finally:
            await db.close()
            await engine.dispose()
    asyncio.run(run())
