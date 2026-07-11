import asyncio

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.db import Base
from app.models import Organization, School, User
from app.models.academic import Class, ClassStudent
from app.modules.school_admin.service import resolve_school_id
from app.modules.school_admin.service_classes import add_student


async def _seed():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    db = async_sessionmaker(engine, expire_on_commit=False)()
    org = Organization(slug="hardening", name="Hardening")
    db.add(org)
    await db.flush()
    school = School(org_id=org.id, name="One")
    other_school = School(org_id=org.id, name="Two")
    db.add_all([school, other_school])
    await db.flush()
    cls = Class(school_id=school.id, name="5A")
    other_cls = Class(school_id=school.id, name="5B")
    student = User(school_id=school.id, role="student", login="student", password_hash="x")
    foreign = User(school_id=other_school.id, role="student", login="foreign", password_hash="x")
    db.add_all([cls, other_cls, student, foreign])
    await db.commit()
    return engine, db, school, cls, other_cls, student, foreign


def test_school_role_without_school_fails_closed() -> None:
    async def run():
        engine, db, *_ = await _seed()
        user = User(role="teacher", login="orphan", password_hash="x")
        try:
            with pytest.raises(HTTPException) as exc:
                await resolve_school_id(user, db)
            assert exc.value.status_code == 403
        finally:
            await db.close()
            await engine.dispose()

    asyncio.run(run())


def test_class_student_requires_same_school_and_one_class() -> None:
    async def run():
        engine, db, school, cls, other_cls, student, foreign = await _seed()
        try:
            with pytest.raises(HTTPException) as exc:
                await add_student(db, school.id, cls.id, foreign.id)
            assert exc.value.status_code == 404
            await add_student(db, school.id, cls.id, student.id)
            await add_student(db, school.id, cls.id, student.id)
            assert len((await db.execute(ClassStudent.__table__.select())).all()) == 1
            with pytest.raises(HTTPException) as exc:
                await add_student(db, school.id, other_cls.id, student.id)
            assert exc.value.status_code == 409
        finally:
            await db.close()
            await engine.dispose()

    asyncio.run(run())
