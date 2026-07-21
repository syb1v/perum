import asyncio
import os

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import get_settings
from app.models import User
from app.models.social import FriendRequest
from app.modules.social import service

POSTGRES_URL = os.getenv("TEST_POSTGRES_URL")
pytestmark = pytest.mark.skipif(not POSTGRES_URL, reason="TEST_POSTGRES_URL is required for PostgreSQL Friends concurrency gate")


async def reset_schema():
    engine = create_async_engine(POSTGRES_URL)
    async with engine.begin() as connection:
        await connection.execute(text("DROP SCHEMA IF EXISTS public CASCADE"))
        await connection.execute(text("CREATE SCHEMA public"))
    await engine.dispose()


def migrate(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", POSTGRES_URL)
    get_settings.cache_clear()
    config = Config("alembic.ini")
    config.set_main_option("sqlalchemy.url", POSTGRES_URL)
    command.upgrade(config, "head")


async def seed():
    engine = create_async_engine(POSTGRES_URL)
    async with engine.begin() as connection:
        await connection.execute(text("INSERT INTO organizations (id, slug, name) VALUES (1, 'org', 'Org')"))
        await connection.execute(text("INSERT INTO schools (id, org_id, name, is_active) VALUES (1, 1, 'School', true)"))
        await connection.execute(text("INSERT INTO users (id, school_id, role, login, password_hash, is_active, must_change_password, balance) VALUES (1, 1, 'student', 'one', 'x', true, false, 0), (2, 1, 'student', 'two', 'x', true, false, 0)"))
        await connection.execute(text("INSERT INTO classes (id, school_id, name, grade_level) VALUES (1, 1, '5A', 5)"))
        await connection.execute(text("INSERT INTO class_students (class_id, student_id) VALUES (1, 1), (1, 2)"))
        await connection.execute(text("INSERT INTO school_social_settings (school_id, social_enabled, friend_scope, message_retention_days, message_links_allowed, message_attachments_enabled, social_moderation_enabled) VALUES (1, true, 'classmates', 365, false, false, true)"))
    await engine.dispose()


@pytest.mark.parametrize("reverse", [False, True])
def test_concurrent_normalized_pair_returns_one_authoritative_pending(monkeypatch, reverse):
    asyncio.run(reset_schema())
    migrate(monkeypatch)
    asyncio.run(seed())

    async def run():
        engine = create_async_engine(POSTGRES_URL, pool_size=4)
        sessions = async_sessionmaker(engine, expire_on_commit=False)
        async with sessions() as lookup:
            users = {row.id: row for row in (await lookup.scalars(select(User).order_by(User.id))).all()}
        started = asyncio.Event()
        release = asyncio.Event()
        original_commit = service.AsyncSession.commit

        async def gated_commit(session):
            started.set()
            await release.wait()
            return await original_commit(session)

        async with sessions() as first, sessions() as second:
            first.commit = gated_commit.__get__(first, type(first))
            second.commit = gated_commit.__get__(second, type(second))
            task_one = asyncio.create_task(service.create_request(first, users[1], users[2].id, "forward"))
            await asyncio.wait_for(started.wait(), 5)
            task_two = asyncio.create_task(service.create_request(second, users[2] if reverse else users[1], users[1].id if reverse else users[2].id, "reverse" if reverse else "parallel"))
            await asyncio.sleep(0)
            release.set()
            rows = await asyncio.wait_for(asyncio.gather(task_one, task_two), 10)
        async with sessions() as verify:
            pending = list((await verify.scalars(select(FriendRequest).where(FriendRequest.status == "pending"))).all())
            audit_count = await verify.scalar(select(func.count()).select_from(text("social_audit_events")).where(text("event_type = 'friend_request_created'")))
        assert len(pending) == 1
        assert rows[0].id == rows[1].id == pending[0].id
        assert audit_count == 1
        await engine.dispose()
    asyncio.run(run())


def test_concurrent_client_identity_reuse_with_different_target_is_bounded(monkeypatch):
    asyncio.run(reset_schema())
    migrate(monkeypatch)

    async def run():
        engine = create_async_engine(POSTGRES_URL)
        async with engine.begin() as connection:
            await connection.execute(text("INSERT INTO organizations (id, slug, name) VALUES (1, 'org', 'Org')"))
            await connection.execute(text("INSERT INTO schools (id, org_id, name, is_active) VALUES (1, 1, 'School', true)"))
            await connection.execute(text("INSERT INTO users (id, school_id, role, login, password_hash, is_active, must_change_password, balance) VALUES (1, 1, 'student', 'one', 'x', true, false, 0), (2, 1, 'student', 'two', 'x', true, false, 0), (3, 1, 'student', 'three', 'x', true, false, 0)"))
            await connection.execute(text("INSERT INTO classes (id, school_id, name, grade_level) VALUES (1, 1, '5A', 5)"))
            await connection.execute(text("INSERT INTO class_students (class_id, student_id) VALUES (1, 1), (1, 2), (1, 3)"))
            await connection.execute(text("INSERT INTO school_social_settings (school_id, social_enabled, friend_scope, message_retention_days, message_links_allowed, message_attachments_enabled, social_moderation_enabled) VALUES (1, true, 'classmates', 365, false, false, true)"))
        sessions = async_sessionmaker(engine, expire_on_commit=False)
        async with sessions() as lookup:
            users = {row.id: row for row in (await lookup.scalars(select(User).order_by(User.id))).all()}
        started = asyncio.Event(); release = asyncio.Event(); original_commit = service.AsyncSession.commit
        async def gated_commit(session):
            started.set(); await release.wait(); return await original_commit(session)
        async with sessions() as first, sessions() as second:
            first.commit = gated_commit.__get__(first, type(first)); second.commit = gated_commit.__get__(second, type(second))
            task_one = asyncio.create_task(service.create_request(first, users[1], users[2].id, "same-id"))
            await asyncio.wait_for(started.wait(), 5)
            task_two = asyncio.create_task(service.create_request(second, users[1], users[3].id, "same-id"))
            await asyncio.sleep(0); release.set()
            results = await asyncio.gather(task_one, task_two, return_exceptions=True)
        assert sum(isinstance(item, FriendRequest) for item in results) == 1
        conflict = next(item for item in results if isinstance(item, service.HTTPException))
        assert conflict.status_code == 409 and conflict.detail == "client_request_id reused with different target"
        async with sessions() as verify:
            assert await verify.scalar(select(func.count(FriendRequest.id))) == 1
        await engine.dispose()
    asyncio.run(run())
