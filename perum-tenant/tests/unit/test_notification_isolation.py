import asyncio

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.db import Base
from app.models import Notification, Organization, School, User
from app.modules.misc.service import list_user_notifications, mark_notification_read, send_notifications


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


async def _reference_scenario():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    db = async_sessionmaker(engine, expire_on_commit=False)()
    org = Organization(slug="notification-reference", name="Notification reference")
    db.add(org)
    await db.flush()
    school = School(org_id=org.id, name="School")
    db.add(school)
    await db.flush()
    owner = User(school_id=school.id, role="school_admin", login="notification-owner", password_hash="x")
    other = User(school_id=school.id, role="director", login="notification-other", password_hash="x")
    db.add_all([owner, other])
    await db.flush()
    notification = Notification(
        school_id=school.id,
        user_id=owner.id,
        title="Ответ организации",
        text="Organization answer",
        type="info",
        ref_type="admin_support_ticket",
        ref_id="ticket-public-id",
    )
    db.add(notification)
    await db.commit()

    result = await list_user_notifications(db, owner)
    assert result["notifications"][0]["ref_type"] == "admin_support_ticket"
    assert result["notifications"][0]["ref_id"] == "ticket-public-id"
    with pytest.raises(HTTPException) as error:
        await mark_notification_read(db, other, notification.id)
    assert error.value.status_code == 404
    await mark_notification_read(db, owner, notification.id)
    assert notification.is_read is True
    await db.close()
    await engine.dispose()


def test_notification_reference_is_serialized_and_read_is_owner_scoped():
    asyncio.run(_reference_scenario())
