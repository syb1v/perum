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
from app.models.social import SocialRealtimeTicket, SocialSettings
from app.modules.social.realtime import SocialRealtimeManager, consume_ticket, event, issue_ticket, token_digest


async def seed():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with sessions() as db:
        org = Organization(slug="x", name="X")
        db.add(org)
        await db.flush()
        schools = [School(org_id=org.id, name="A"), School(org_id=org.id, name="B")]
        db.add_all(schools)
        await db.flush()
        users = [User(school_id=schools[0].id, role="student", login="student", password_hash="x"), User(school_id=schools[1].id, role="student", login="other", password_hash="x"), User(school_id=schools[0].id, role="teacher", login="teacher", password_hash="x")]
        db.add_all(users)
        await db.flush()
        classes = [Class(school_id=school.id, name=f"{index}A", grade_level=5) for index, school in enumerate(schools)]
        db.add_all(classes)
        await db.flush()
        db.add_all([ClassStudent(class_id=classes[0].id, student_id=users[0].id), ClassStudent(class_id=classes[1].id, student_id=users[1].id)])
        db.add_all([SocialSettings(school_id=school.id, social_enabled=True, social_moderation_enabled=True) for school in schools])
        await db.commit()
        user_ids = [user.id for user in users]
        school_ids = [school.id for school in schools]
    return engine, sessions, user_ids, school_ids


def test_ticket_digest_expiry_single_use_isolation_and_eligibility():
    async def run():
        engine, sessions, user_ids, school_ids = await seed()
        try:
            async with sessions() as db:
                student = await db.get(User, user_ids[0])
                ticket, expires_at = await issue_ticket(db, student)
                assert expires_at <= utc_now() + timedelta(seconds=60)
                stored = await db.scalar(select(SocialRealtimeTicket).where(SocialRealtimeTicket.user_id == student.id))
                assert stored.token_digest == token_digest(ticket)
                assert ticket not in stored.token_digest
                assert (await consume_ticket(db, ticket))[0].id == student.id
                assert await consume_ticket(db, ticket) is None
                foreign = SocialRealtimeTicket(school_id=school_ids[1], user_id=user_ids[1], token_digest=token_digest("foreign"), expires_at=utc_now() + timedelta(seconds=60))
                expired = SocialRealtimeTicket(school_id=school_ids[0], user_id=user_ids[0], token_digest=token_digest("expired"), expires_at=utc_now() - timedelta(seconds=1))
                db.add_all([foreign, expired])
                await db.commit()
                identity = await consume_ticket(db, "foreign")
                assert identity is not None and identity[0].id == user_ids[1] and identity[1] == school_ids[1]
                assert await consume_ticket(db, "expired") is None
                disabled = await db.get(SocialSettings, school_ids[0])
                disabled.social_enabled = False
                ineligible = SocialRealtimeTicket(school_id=school_ids[0], user_id=user_ids[0], token_digest=token_digest("disabled"), expires_at=utc_now() + timedelta(seconds=60))
                db.add(ineligible)
                await db.commit()
                assert await consume_ticket(db, "disabled") is None
                teacher = await db.get(User, user_ids[2])
                teacher_ticket = SocialRealtimeTicket(school_id=school_ids[0], user_id=teacher.id, token_digest=token_digest("teacher"), expires_at=utc_now() + timedelta(seconds=60))
                db.add(teacher_ticket)
                await db.commit()
                assert await consume_ticket(db, "teacher") is None
                disabled.social_enabled = True
                await db.commit()
                for _ in range(3):
                    await issue_ticket(db, student)
                with pytest.raises(HTTPException) as limited:
                    await issue_ticket(db, student)
                assert limited.value.status_code == 429
        finally:
            await engine.dispose()
    asyncio.run(run())


def test_manager_authorized_delivery_limits_and_body_free_envelope():
    async def run():
        manager = SocialRealtimeManager(max_sockets=3, queue_size=2)
        first = await manager.register(1, 10)
        second = await manager.register(1, 20)
        foreign_school = await manager.register(2, 10)
        assert first is not None and second is not None and foreign_school is not None
        assert await manager.register(1, 10) is not None
        assert await manager.register(1, 10) is not None
        assert await manager.register(1, 10) is None
        payload = event("message.created", conversation_id=7, message_id=8, sender_id=10)
        await manager.publish(1, {10, 20}, payload)
        assert await first.queue.get() == payload
        assert await second.queue.get() == payload
        assert foreign_school.queue.empty()
        assert payload["v"] == 1
        assert set(payload) == {"v", "type", "occurred_at", "data"}
        assert payload["type"] == "message.created"
        assert "body" not in str(payload).lower()
    asyncio.run(run())
