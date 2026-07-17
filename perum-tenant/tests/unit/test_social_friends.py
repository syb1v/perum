import asyncio

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.db import Base
from app.models import Organization, School, User
from app.models.academic import Class, ClassStudent
from app.models.social import FriendRequest, Friendship, SocialSettings
from app.modules.social import service
from app.modules.social.schemas import SettingsPatch


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
