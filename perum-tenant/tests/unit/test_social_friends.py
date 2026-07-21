import asyncio
from datetime import timedelta

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.db import Base
from app.models import Organization, School, User
from app.models.academic import Class, ClassStudent
from app.models.social import FriendRequest, Friendship, SocialSettings, UserBlock
from app.modules.social import service
from app.modules.social.schemas import SettingsPatch
from app.telemetry import collect_metrics


async def seed():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    db = async_sessionmaker(engine, expire_on_commit=False)()
    org = Organization(slug="x", name="X")
    db.add(org)
    await db.flush()
    school, other = School(org_id=org.id, name="S"), School(org_id=org.id, name="O")
    db.add_all([school, other])
    await db.flush()
    users = [User(school_id=school.id, role="student", login=f"u{i}", first_name=f"U{i}", password_hash="x") for i in range(3)]
    users.append(User(school_id=other.id, role="student", login="foreign", password_hash="x"))
    db.add_all(users)
    await db.flush()
    classes = [Class(school_id=school.id, name="5A", grade_level=5), Class(school_id=school.id, name="8A", grade_level=8), Class(school_id=other.id, name="5B", grade_level=5)]
    db.add_all(classes)
    await db.flush()
    db.add_all([ClassStudent(class_id=classes[0].id, student_id=users[0].id), ClassStudent(class_id=classes[0].id, student_id=users[1].id), ClassStudent(class_id=classes[1].id, student_id=users[2].id), ClassStudent(class_id=classes[2].id, student_id=users[3].id)])
    await db.commit()
    return engine, db, users, school


def test_scope_idempotency_accept_and_block_cleanup():
    async def run():
        engine, db, users, school = await seed()
        try:
            await service.patch_settings(db, school.id, SettingsPatch(social_enabled=True, social_min_grade=5, social_max_grade=7))
            one = await service.create_request(db, users[0], users[1].id, "retry")
            assert (await service.create_request(db, users[0], users[1].id, "retry")).id == one.id
            await service.request_action(db, users[1], one.id, "accept")
            assert await db.scalar(select(Friendship.id).where(Friendship.ended_at.is_(None)))
            await service.block(db, users[0], users[1].id, "safety")
            assert await db.scalar(select(Friendship.id).where(Friendship.ended_at.is_(None))) is None
            for target in (users[2], users[3]):
                with pytest.raises(HTTPException) as exc:
                    await service.create_request(db, users[0], target.id, "x")
                assert exc.value.status_code in (403, 404)
        finally:
            await db.close()
            await engine.dispose()
    asyncio.run(run())


def test_student_search_cursor_has_no_skips_duplicates_or_cross_school_rows():
    async def run():
        engine, db, users, school = await seed()
        try:
            own_class = await db.scalar(select(Class).where(Class.school_id == school.id, Class.grade_level == 5))
            extra = [User(school_id=school.id, role="student", login=f"page{i}", first_name=f"Page{i}", password_hash="x") for i in range(5)]
            db.add_all(extra); await db.flush()
            db.add_all([ClassStudent(class_id=own_class.id, student_id=row.id) for row in extra]); await db.commit()
            await service.patch_settings(db, school.id, SettingsPatch(social_enabled=True))
            seen = []
            cursor = None
            while True:
                items, cursor = await service.students(db, users[0], "", cursor, 2)
                seen.extend(item.id for item in items)
                if cursor is None:
                    break
            expected = sorted([users[1].id, *[row.id for row in extra]])
            assert seen == expected
            assert len(seen) == len(set(seen))
            assert users[3].id not in seen
        finally:
            await db.close(); await engine.dispose()
    asyncio.run(run())


def test_default_disabled_and_pending_pair_normalized():
    async def run():
        engine, db, users, school = await seed()
        try:
            assert not (await service.get_settings(db, school.id)).social_enabled
            await service.patch_settings(db, school.id, SettingsPatch(social_enabled=True))
            first = await service.create_request(db, users[0], users[1].id, "a")
            reverse = await service.create_request(db, users[1], users[0].id, "b")
            assert reverse.id == first.id
            assert (await db.scalars(select(FriendRequest))).all() == [first]
        finally:
            await db.close()
            await engine.dispose()
    asyncio.run(run())


def test_expired_request_is_hidden_rejected_and_replaced_with_new_identity():
    async def run():
        engine, db, users, school = await seed()
        try:
            await service.patch_settings(db, school.id, SettingsPatch(social_enabled=True))
            expired = await service.create_request(db, users[0], users[1].id, "expired-action")
            expired.expires_at = service.utc_now() - timedelta(seconds=1)
            await db.commit()

            assert await service.friend_requests(db, users[0], "outgoing") == []
            await db.refresh(expired)
            assert expired.status == "expired"
            assert expired.responded_at is not None
            with pytest.raises(HTTPException) as action_error:
                await service.request_action(db, users[1], expired.id, "accept")
            assert action_error.value.status_code == 404

            replay = await service.create_request(db, users[0], users[1].id, "expired-action")
            assert replay.id == expired.id
            assert replay.status == "expired"
            replacement = await service.create_request(db, users[0], users[1].id, "replacement-action")
            assert replacement.id != expired.id
            assert replacement.status == "pending"
            assert (await service.create_request(db, users[1], users[0].id, "reverse-action")).id == replacement.id
        finally:
            await db.close()
            await engine.dispose()
    asyncio.run(run())


def test_expired_action_is_persisted_before_not_found():
    async def run():
        engine, db, users, school = await seed()
        try:
            await service.patch_settings(db, school.id, SettingsPatch(social_enabled=True))
            request = await service.create_request(db, users[0], users[1].id, "expired-direct-action")
            request.expires_at = service.utc_now() - timedelta(seconds=1)
            await db.commit()
            with pytest.raises(HTTPException) as action_error:
                await service.request_action(db, users[1], request.id, "accept")
            assert action_error.value.status_code == 404
            await db.refresh(request)
            assert request.status == "expired"
            assert await db.scalar(select(Friendship.id).where(Friendship.ended_at.is_(None))) is None
        finally:
            await db.close()
            await engine.dispose()
    asyncio.run(run())


def test_telemetry_counts_only_unexpired_pending_requests():
    async def run():
        engine, db, users, school = await seed()
        try:
            now = service.utc_now()
            db.add_all([
                FriendRequest(school_id=school.id, requester_id=users[0].id, addressee_id=users[1].id, user_low_id=users[0].id, user_high_id=users[1].id, client_request_id="stale-metric", expires_at=now - timedelta(seconds=1)),
                FriendRequest(school_id=school.id, requester_id=users[0].id, addressee_id=users[2].id, user_low_id=users[0].id, user_high_id=users[2].id, client_request_id="live-metric", expires_at=now + timedelta(days=1)),
            ])
            await db.commit()
            metrics = await collect_metrics(db, school.id)
            assert metrics["social"]["friend_requests_pending"] == 1
        finally:
            await db.close()
            await engine.dispose()
    asyncio.run(run())


def test_create_persists_expiration_before_blocked_pair_rejection():
    async def run():
        engine, db, users, school = await seed()
        try:
            await service.patch_settings(db, school.id, SettingsPatch(social_enabled=True))
            request = await service.create_request(db, users[0], users[1].id, "expires-before-block")
            request.expires_at = service.utc_now() - timedelta(seconds=1)
            db.add(UserBlock(school_id=school.id, blocker_id=users[1].id, blocked_id=users[0].id))
            await db.commit()
            with pytest.raises(HTTPException) as blocked:
                await service.create_request(db, users[0], users[1].id, "blocked-replacement")
            assert blocked.value.status_code == 404
            await db.rollback()
            await db.refresh(request)
            assert request.status == "expired"
        finally:
            await db.close()
            await engine.dispose()
    asyncio.run(run())
