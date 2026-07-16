import asyncio
from datetime import timedelta

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.db import Base
from app.core.time import utc_now
from app.models import Organization, School, User
from app.models.academic import Class, ClassStudent
from app.models.social import ConversationMember, FriendRequest, Friendship, Message
from app.modules.social import service
from app.modules.social.realtime import manager
from app.modules.social.schemas import SettingsPatch


async def seed():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    db = async_sessionmaker(engine, expire_on_commit=False)()
    org = Organization(slug="x", name="X")
    db.add(org); await db.flush()
    school, other = School(org_id=org.id, name="S"), School(org_id=org.id, name="O")
    db.add_all([school, other]); await db.flush()
    users = [User(school_id=school.id, role="student", login=f"u{i}", password_hash="x") for i in range(3)]
    users.append(User(school_id=other.id, role="student", login="foreign", password_hash="x"))
    db.add_all(users); await db.flush()
    classes = [Class(school_id=school.id, name="5A", grade_level=5), Class(school_id=school.id, name="6A", grade_level=6), Class(school_id=other.id, name="5B", grade_level=5)]
    db.add_all(classes); await db.flush()
    db.add_all([ClassStudent(class_id=classes[0].id, student_id=users[0].id), ClassStudent(class_id=classes[0].id, student_id=users[1].id), ClassStudent(class_id=classes[1].id, student_id=users[2].id), ClassStudent(class_id=classes[2].id, student_id=users[3].id)])
    await db.commit(); await service.patch_settings(db, school.id, SettingsPatch(social_enabled=True, message_retention_days=30))
    request = FriendRequest(school_id=school.id, requester_id=users[0].id, addressee_id=users[1].id, user_low_id=users[0].id, user_high_id=users[1].id, client_request_id="friend", status="accepted", expires_at=utc_now() + timedelta(days=1))
    db.add(request); await db.flush(); db.add(Friendship(school_id=school.id, user_low_id=users[0].id, user_high_id=users[1].id, created_from_request_id=request.id)); await db.commit()
    return engine, db, users, school


def test_conversation_send_dedupe_read_and_history_after_unfriend():
    async def run():
        engine, db, users, _ = await seed()
        try:
            conversation = await service.create_conversation(db, users[0], users[1].id)
            assert (await service.create_conversation(db, users[1], users[0].id)).id == conversation.id
            connection = await manager.register(users[0].school_id, users[0].id)
            message = await service.send_message(db, users[0], conversation.id, "one", "  hello. world!  ")
            assert message.body == "hello. world!"
            created_event = await connection.queue.get()
            assert created_event["type"] == "message.created"
            assert created_event["data"] == {"conversation_id": conversation.id, "message_id": message.id, "sender_id": users[0].id}
            assert "body" not in str(created_event).lower()
            assert (await service.send_message(db, users[0], conversation.id, "one", "hello. world!")).id == message.id
            assert connection.queue.empty()
            with pytest.raises(HTTPException) as conflict:
                await service.send_message(db, users[0], conversation.id, "one", "changed")
            assert conflict.value.status_code == 409
            await service.mark_read(db, users[1], conversation.id, message.id)
            read_event = await connection.queue.get()
            assert read_event["type"] == "conversation.read"
            await service.mark_read(db, users[1], conversation.id, message.id)
            assert connection.queue.empty()
            member = await db.scalar(select(ConversationMember).where(ConversationMember.conversation_id == conversation.id, ConversationMember.user_id == users[1].id))
            assert member.last_read_message_id == message.id
            await service.end_friendship(db, users[0], users[1].id)
            assert (await connection.queue.get())["type"] == "conversation.changed"
            assert (await service.conversation_for_member(db, users[1], conversation.id))[0].id == conversation.id
            assert not (await service.conversation_out(db, users[1], conversation))["can_send"]
            with pytest.raises(HTTPException) as disabled:
                await service.send_message(db, users[1], conversation.id, "two", "no")
            assert disabled.value.status_code == 403
            await manager.unregister(connection)
        finally:
            await db.close(); await engine.dispose()
    asyncio.run(run())


def test_links_scope_isolation_and_retention_snapshot():
    async def run():
        engine, db, users, _ = await seed()
        try:
            conversation = await service.create_conversation(db, users[0], users[1].id)
            for body in ("https://example.com", "w\u200bww.example.com", "example . ru"):
                with pytest.raises(HTTPException) as links:
                    await service.send_message(db, users[0], conversation.id, body, body)
                assert links.value.status_code == 422
            message = await service.send_message(db, users[0], conversation.id, "safe", "Version 1.2 is fine, hello.worldwide too")
            assert message.expires_at >= message.created_at + timedelta(days=29)
            message.is_visible = False
            await db.commit()
            preview = await service.conversation_out(db, users[1], conversation)
            assert preview["last_message"] is None
            assert preview["unread_count"] == 0
            with pytest.raises(HTTPException) as foreign:
                await service.conversation_for_member(db, users[3], conversation.id)
            assert foreign.value.status_code == 404
            with pytest.raises(HTTPException) as out_of_scope:
                await service.create_conversation(db, users[0], users[2].id)
            assert out_of_scope.value.status_code == 404
            message.expires_at = utc_now() - timedelta(seconds=1); await db.commit()
            assert await db.scalar(select(Message.id).where(Message.id == message.id, Message.expires_at > utc_now())) is None
        finally:
            await db.close(); await engine.dispose()
    asyncio.run(run())
