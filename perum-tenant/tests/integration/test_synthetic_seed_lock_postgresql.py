import asyncio
import os

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import create_async_engine


def test_synthetic_seed_session_lock_survives_commits():
    url = os.environ.get("TEST_POSTGRES_URL")
    if not url:
        pytest.skip("TEST_POSTGRES_URL is not configured")
    if url.startswith("postgresql://"):
        url = "postgresql+asyncpg://" + url.removeprefix("postgresql://")

    async def run():
        engine = create_async_engine(url)
        key = 2_147_483_000
        first = await engine.connect()
        second = await engine.connect()
        try:
            assert await first.scalar(select(func.pg_try_advisory_lock(0x53594E52, key))) is True
            await first.commit()
            assert await second.scalar(select(func.pg_try_advisory_lock(0x53594E52, key))) is False
            await second.rollback()
            assert await first.scalar(select(func.pg_advisory_unlock(0x53594E52, key))) is True
            assert await second.scalar(select(func.pg_try_advisory_lock(0x53594E52, key))) is True
            assert await second.scalar(select(func.pg_advisory_unlock(0x53594E52, key))) is True
        finally:
            await first.close()
            await second.close()
            await engine.dispose()

    asyncio.run(run())
