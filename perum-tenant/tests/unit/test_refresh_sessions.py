import asyncio

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.db import Base
from app.core.security import decode_access_token, hash_password
from app.models import Organization, RefreshSession, School, User
from app.modules.auth.service import authenticate, rotate_refresh


async def _scenario():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    session = async_sessionmaker(engine, expire_on_commit=False)()
    org = Organization(slug="test", name="Test")
    session.add(org)
    await session.flush()
    school = School(org_id=org.id, name="Test")
    session.add(school)
    await session.flush()
    session.add(User(school_id=school.id, role="student", login="mobile", password_hash=hash_password("secret")))
    await session.commit()

    access, refresh = await authenticate(session, "mobile", "secret", {"device_name": "Phone"})
    row = await session.scalar(select(RefreshSession))
    assert row is not None
    assert refresh not in row.refresh_token_hash
    assert decode_access_token(access)["session_token"] == row.session_token

    rotated_access, rotated_refresh = await rotate_refresh(session, refresh)
    assert rotated_refresh != refresh
    assert decode_access_token(rotated_access)["token_version"] == 2
    with pytest.raises(HTTPException) as error:
        await rotate_refresh(session, refresh)
    assert error.value.status_code == 401
    await session.refresh(row)
    assert row.revoked_at is not None
    await session.close()
    await engine.dispose()


async def _inactive_school_scenario():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    session = async_sessionmaker(engine, expire_on_commit=False)()
    org = Organization(slug="inactive", name="Inactive")
    session.add(org)
    await session.flush()
    school = School(org_id=org.id, name="Inactive", is_active=False)
    session.add(school)
    await session.flush()
    session.add(User(school_id=school.id, role="student", login="inactive", password_hash=hash_password("secret")))
    await session.commit()

    with pytest.raises(HTTPException) as error:
        await authenticate(session, "inactive", "secret")
    assert error.value.status_code == 401
    await session.close()
    await engine.dispose()


def test_refresh_rotation_and_reuse_revocation():
    asyncio.run(_scenario())


def test_inactive_school_cannot_authenticate():
    asyncio.run(_inactive_school_scenario())
