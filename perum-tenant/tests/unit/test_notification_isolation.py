import asyncio

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.db import Base
from app.models import Organization, School, User
from app.modules.misc.service import send_notifications


async def _scenario():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    db = async_sessionmaker(engine, expire_on_commit=False)()
    org = Organization(slug="notifications", name="Notifications")
    db.add(org)
    await db.flush()
    own_school = School(org_id=org.id, name="Own")
    other_school = School(org_id=org.id, name="Other")
    db.add_all([own_school, other_school])
    await db.flush()
    foreign_user = User(school_id=other_school.id, role="student", login="foreign-notification", password_hash="x")
    db.add(foreign_user)
    await db.commit()

    with pytest.raises(HTTPException) as error:
        await send_notifications(db, own_school.id, "private", "user", None, foreign_user.id)
    assert error.value.status_code == 404
    await db.close()
    await engine.dispose()


def test_targeted_notification_cannot_cross_school_boundary():
    asyncio.run(_scenario())
