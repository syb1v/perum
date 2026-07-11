import asyncio

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.db import Base
from app.models import Organization, ParentStudent, School, User
from app.modules.parent import service


async def _seed():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    db = async_sessionmaker(engine, expire_on_commit=False)()
    organization = Organization(slug="parent-academics", name="Parent academics")
    db.add(organization)
    await db.flush()
    school = School(org_id=organization.id, name="School")
    other_school = School(org_id=organization.id, name="Other")
    db.add_all([school, other_school])
    await db.flush()
    parent = User(role="parent", school_id=school.id, login="parent-a", password_hash="x", is_active=True)
    child = User(role="student", school_id=school.id, login="child-a", password_hash="x", is_active=True)
    inactive = User(role="student", school_id=school.id, login="inactive-a", password_hash="x", is_active=False)
    foreign = User(role="student", school_id=other_school.id, login="foreign-a", password_hash="x", is_active=True)
    db.add_all([parent, child, inactive, foreign])
    await db.flush()
    db.add_all([
        ParentStudent(parent_id=parent.id, student_id=child.id),
        ParentStudent(parent_id=parent.id, student_id=inactive.id),
        ParentStudent(parent_id=parent.id, student_id=foreign.id),
    ])
    await db.commit()
    return engine, db, school, parent, child, inactive, foreign


def test_parent_academic_views_delegate_only_for_active_same_school_child(monkeypatch) -> None:
    async def run():
        engine, db, school, parent, child, inactive, foreign = await _seed()
        calls = []

        async def fake(db_arg, school_id, student, *args):
            calls.append((db_arg, school_id, student.id, args))
            return {"student_id": student.id}

        monkeypatch.setattr(service.student_service, "get_diary", fake)
        monkeypatch.setattr(service.student_service, "get_grades", fake)
        monkeypatch.setattr(service.student_service, "get_summary", fake)
        monkeypatch.setattr(service.student_service, "get_analytics", fake)
        monkeypatch.setattr(service.student_service, "get_finals", fake)
        try:
            assert await service.child_diary(db, school.id, parent, child.id, 2) == {"student_id": child.id}
            assert await service.child_grades(db, school.id, parent, child.id, 7) == {"student_id": child.id}
            assert await service.child_grades_summary(db, school.id, parent, child.id) == {"student_id": child.id}
            assert await service.child_grades_analytics(db, school.id, parent, child.id) == {"student_id": child.id}
            assert await service.child_grades_finals(db, school.id, parent, child.id) == {"student_id": child.id}
            assert [call[2] for call in calls] == [child.id] * 5
            assert calls[0][3] == (2,)
            assert calls[1][3] == (7,)
            for forbidden in (inactive, foreign):
                with pytest.raises(HTTPException) as error:
                    await service.child_grades_summary(db, school.id, parent, forbidden.id)
                assert error.value.status_code == 403
        finally:
            await db.close()
            await engine.dispose()

    asyncio.run(run())
