import asyncio
import os
from datetime import timedelta
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import inspect, select, text, update
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import Settings, get_settings
from app.core.time import utc_now
from app.models import MediaAuditEvent, MediaObject, MediaScanResult
from app.modules.media import service
from app.modules.media.scanner import FakeScanner
from app.modules.media.storage import LocalPrivateStorage

POSTGRES_URL = os.getenv("TEST_POSTGRES_URL")
pytestmark = pytest.mark.skipif(not POSTGRES_URL, reason="TEST_POSTGRES_URL is required for PostgreSQL scanner gate")


def alembic_config(monkeypatch) -> Config:
    monkeypatch.setenv("DATABASE_URL", POSTGRES_URL)
    get_settings.cache_clear()
    config = Config("alembic.ini")
    config.set_main_option("sqlalchemy.url", POSTGRES_URL)
    return config


async def reset_schema():
    engine = create_async_engine(POSTGRES_URL)
    async with engine.begin() as connection:
        await connection.execute(text("DROP SCHEMA IF EXISTS public CASCADE"))
        await connection.execute(text("CREATE SCHEMA public"))
    await engine.dispose()


async def seed_media_row():
    engine = create_async_engine(POSTGRES_URL)
    async with engine.begin() as connection:
        await connection.execute(text("INSERT INTO organizations (id, slug, name) VALUES (1, 'org', 'Org')"))
        await connection.execute(text("INSERT INTO schools (id, org_id, name, is_active) VALUES (1, 1, 'School', true)"))
        await connection.execute(text("INSERT INTO users (id, school_id, role, login, password_hash, is_active, must_change_password, balance) VALUES (1, 1, 'student', 'student', 'x', true, false, 0)"))
        await connection.execute(text("INSERT INTO media_objects (id, school_id, owner_id, purpose, filename, mime_type, extension, size_bytes, sha256, storage_key, state, owner_grace_until) VALUES ('00000000-0000-0000-0000-000000000001', 1, 1, 'support', 'a.png', 'image/png', '.png', 4, :sha, 'quarantine/a', 'pending', now())"), {"sha": "a" * 64})
        await connection.execute(text("INSERT INTO media_scan_results (id, school_id, object_id, scanner, verdict) VALUES ('00000000-0000-0000-0000-000000000002', 1, '00000000-0000-0000-0000-000000000001', 'clamav', 'clean')"))
    await engine.dispose()


async def schema_snapshot():
    engine = create_async_engine(POSTGRES_URL)
    async with engine.connect() as connection:
        def inspect_sync(sync_connection):
            inspector = inspect(sync_connection)
            return (
                {item["name"] for item in inspector.get_columns("media_objects")},
                {item["name"] for item in inspector.get_columns("media_scan_results")},
                {item["name"]: item["column_names"] for item in inspector.get_indexes("media_objects")},
            )
        result = await connection.run_sync(inspect_sync)
    await engine.dispose()
    return result


def test_scanner_migration_postgresql_round_trip(monkeypatch):
    asyncio.run(reset_schema())
    config = alembic_config(monkeypatch)
    command.upgrade(config, "tenant_0036_social_hardening")
    asyncio.run(seed_media_row())
    command.upgrade(config, "tenant_0037_scanner_foundation")
    object_columns, result_columns, indexes = asyncio.run(schema_snapshot())
    assert {"scan_attempts", "next_scan_at", "scan_lease_token", "scan_lease_expires_at"} <= object_columns
    assert {"engine_version", "signature_version", "signature_at", "detail_code", "duration_ms"} <= result_columns
    assert indexes["ix_media_objects_scan_claim"] == ["state", "next_scan_at", "scan_lease_expires_at", "created_at"]

    async def set_and_read():
        engine = create_async_engine(POSTGRES_URL)
        async with engine.begin() as connection:
            assert await connection.scalar(text("SELECT scan_attempts FROM media_objects WHERE id = '00000000-0000-0000-0000-000000000001'")) == 0
            await connection.execute(text("UPDATE media_objects SET scan_attempts=7, scan_lease_token='11111111-1111-1111-1111-111111111111'"))
            await connection.execute(text("UPDATE media_scan_results SET engine_version='sentinel', duration_ms=1234"))
        await engine.dispose()
    asyncio.run(set_and_read())
    command.downgrade(config, "tenant_0036_social_hardening")
    object_columns, result_columns, indexes = asyncio.run(schema_snapshot())
    assert "scan_attempts" not in object_columns and "engine_version" not in result_columns
    assert "ix_media_objects_scan_claim" not in indexes
    command.upgrade(config, "tenant_0037_scanner_foundation")

    async def verify_reset():
        engine = create_async_engine(POSTGRES_URL)
        async with engine.connect() as connection:
            row = (await connection.execute(text("SELECT scan_attempts, scan_lease_token FROM media_objects WHERE id = '00000000-0000-0000-0000-000000000001'"))).one()
            evidence = (await connection.execute(text("SELECT engine_version, duration_ms FROM media_scan_results WHERE id = '00000000-0000-0000-0000-000000000002'"))).one()
            assert row == (0, None) and evidence == (None, None)
        await engine.dispose()
    asyncio.run(verify_reset())


def test_postgresql_skip_locked_and_stale_worker_fencing(monkeypatch, tmp_path):
    asyncio.run(reset_schema())
    command.upgrade(alembic_config(monkeypatch), "head")
    asyncio.run(seed_media_row())

    async def run():
        engine = create_async_engine(POSTGRES_URL, pool_size=4)
        sessions = async_sessionmaker(engine, expire_on_commit=False)
        async with sessions() as locker, sessions() as contender:
            await locker.execute(select(MediaObject).where(MediaObject.id == "00000000-0000-0000-0000-000000000001").with_for_update())
            _, skipped = await asyncio.wait_for(service.claim_pending(contender, 1, 120), 5)
            assert skipped == []
            await locker.rollback()

        store = LocalPrivateStorage(tmp_path)
        key = "quarantine/a"
        path = store.path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b"data")
        started = asyncio.Event()
        release = asyncio.Event()

        class BlockingScanner:
            async def scan(self, path: Path):
                started.set()
                await asyncio.wait_for(release.wait(), 5)
                return await FakeScanner("clean").scan(path)

        settings = Settings(MEDIA_ROOT=str(tmp_path), SCANNER_LEASE_S=120)
        async with sessions() as first:
            task = asyncio.create_task(service.scan_pending(first, BlockingScanner(), store, limit=1, settings=settings))
            await asyncio.wait_for(started.wait(), 5)
            async with sessions() as expire:
                await expire.execute(update(MediaObject).where(MediaObject.id == "00000000-0000-0000-0000-000000000001").values(scan_lease_expires_at=utc_now() - timedelta(seconds=1)))
                await expire.commit()
            async with sessions() as second:
                winner = await service.scan_pending(second, FakeScanner("infected"), store, limit=1, settings=settings)
                assert winner["infected"] == 1
            release.set()
            stale = await asyncio.wait_for(task, 5)
            assert sum(stale.values()) == 0
        async with sessions() as verify:
            object_ = await verify.get(MediaObject, "00000000-0000-0000-0000-000000000001")
            results = list((await verify.scalars(select(MediaScanResult))).all())
            audits = list((await verify.scalars(select(MediaAuditEvent).where(MediaAuditEvent.event_type == "scan_completed"))).all())
            assert object_.state == "infected" and len(results) == len(audits) == 1
            assert results[0].verdict == "infected"
        await engine.dispose()
    asyncio.run(run())
