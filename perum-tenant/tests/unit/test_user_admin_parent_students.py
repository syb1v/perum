import asyncio

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.db import Base
from app.models import Organization, ParentStudent, School, User
from app.modules.user_admin import service
from app.modules.user_admin.schemas import AdminParentStudentsOut, ReplaceParentStudentsRequest


def test_replace_parent_students_request_is_closed_and_validated() -> None:
    assert ReplaceParentStudentsRequest.model_validate({"student_ids": []}).student_ids == []
    assert ReplaceParentStudentsRequest.model_validate({"student_ids": [2, 3]}).student_ids == [2, 3]
    for bad in (
        {"student_ids": [1, 1]},
        {"student_ids": [0]},
        {"student_ids": [-3]},
        {"student_ids": ["5"]},
        {"student_ids": list(range(1, 102))},
        {"student_ids": [1], "extra": True},
    ):
        with pytest.raises(ValidationError):
            ReplaceParentStudentsRequest.model_validate(bad)


def test_parent_students_out_is_closed() -> None:
    out = AdminParentStudentsOut.model_validate({"parent_id": 1, "student_ids": [2, 3]})
    assert out.student_ids == [2, 3]
    with pytest.raises(ValidationError):
        AdminParentStudentsOut.model_validate({"parent_id": 1})
    with pytest.raises(ValidationError):
        AdminParentStudentsOut.model_validate({"parent_id": 1, "student_ids": [], "extra": 1})


async def _seed():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    db = async_sessionmaker(engine, expire_on_commit=False)()
    organization = Organization(slug="parent-links", name="Parent links")
    db.add(organization)
    await db.flush()
    school = School(org_id=organization.id, name="School A")
    other = School(org_id=organization.id, name="School B")
    db.add_all([school, other])
    await db.flush()
    parent = User(role="parent", school_id=school.id, login="pa", password_hash="x")
    other_parent = User(role="parent", school_id=school.id, login="pb", password_hash="x")
    foreign_parent = User(role="parent", school_id=other.id, login="pf", password_hash="x")
    inactive_parent = User(role="parent", school_id=school.id, login="pi", password_hash="x", is_active=False)
    teacher = User(role="teacher", school_id=school.id, login="ta", password_hash="x")
    student_one = User(role="student", school_id=school.id, login="sa", password_hash="x")
    student_two = User(role="student", school_id=school.id, login="sb", password_hash="x")
    inactive_student = User(role="student", school_id=school.id, login="si", password_hash="x", is_active=False)
    foreign_student = User(role="student", school_id=other.id, login="sf", password_hash="x")
    db.add_all([parent, other_parent, foreign_parent, inactive_parent, teacher, student_one, student_two, inactive_student, foreign_student])
    await db.flush()
    db.add_all([
        ParentStudent(parent_id=parent.id, student_id=student_one.id),
        ParentStudent(parent_id=parent.id, student_id=inactive_student.id),
        ParentStudent(parent_id=parent.id, student_id=foreign_student.id),
        ParentStudent(parent_id=other_parent.id, student_id=student_one.id),
    ])
    await db.commit()
    return engine, db, school, other, parent, other_parent, foreign_parent, inactive_parent, teacher, student_one, student_two, inactive_student, foreign_student


def test_get_parent_students_returns_only_valid_links_and_rejects_bad_parent() -> None:
    async def run():
        engine, db, school, other, parent, _, foreign_parent, inactive_parent, teacher, student_one, *_ = await _seed()
        try:
            result = await service.get_parent_students(db, school.id, parent.id)
            assert result == {"parent_id": parent.id, "student_ids": [student_one.id]}
            for bad_id in (foreign_parent.id, inactive_parent.id, teacher.id, 99999):
                with pytest.raises(HTTPException) as error:
                    await service.get_parent_students(db, school.id, bad_id)
                assert error.value.status_code == 404
            with pytest.raises(HTTPException) as error:
                await service.get_parent_students(db, other.id, parent.id)
            assert error.value.status_code == 404
        finally:
            await db.close()
            await engine.dispose()
    asyncio.run(run())


def test_replace_parent_students_validates_before_mutation() -> None:
    async def run():
        engine, db, school, _, parent, other_parent, _, _, _, student_one, student_two, inactive_student, foreign_student = await _seed()
        try:
            before = set((await db.execute(select(ParentStudent))).scalars().all())
            for bad_ids in ([foreign_student.id], [inactive_student.id], [99999], [student_two.id, foreign_student.id]):
                with pytest.raises(HTTPException) as error:
                    await service.replace_parent_students(db, school.id, parent.id, bad_ids)
                assert error.value.status_code == 404
            after = set((await db.execute(select(ParentStudent))).scalars().all())
            assert after == before
        finally:
            await db.close()
            await engine.dispose()
    asyncio.run(run())


def test_replace_parent_students_replaces_and_unlinks_atomically() -> None:
    async def run():
        engine, db, school, _, parent, other_parent, _, _, _, student_one, student_two, _, _ = await _seed()
        try:
            unchanged_created = (
                await db.execute(select(ParentStudent).where(
                    ParentStudent.parent_id == parent.id, ParentStudent.student_id == student_one.id
                ))
            ).scalar_one().created_at

            result = await service.replace_parent_students(db, school.id, parent.id, [student_two.id, student_one.id])
            assert result == {"parent_id": parent.id, "student_ids": [student_one.id, student_two.id]}
            rows = {
                row.student_id: row
                for row in (await db.execute(select(ParentStudent).where(ParentStudent.parent_id == parent.id))).scalars().all()
            }
            assert set(rows) == {student_one.id, student_two.id}
            assert rows[student_one.id].created_at == unchanged_created
            other_links = (await db.execute(select(ParentStudent).where(ParentStudent.parent_id == other_parent.id))).scalars().all()
            assert len(other_links) == 1

            result = await service.replace_parent_students(db, school.id, parent.id, [student_one.id])
            assert result["student_ids"] == [student_one.id]
            count = len((await db.execute(select(ParentStudent).where(ParentStudent.parent_id == parent.id))).scalars().all())
            assert count == 1

            result = await service.replace_parent_students(db, school.id, parent.id, [])
            assert result["student_ids"] == []
            count = len((await db.execute(select(ParentStudent).where(ParentStudent.parent_id == parent.id))).scalars().all())
            assert count == 0
            assert await db.get(User, parent.id) is not None
            assert await db.get(User, student_two.id) is not None

            result = await service.replace_parent_students(db, school.id, parent.id, [student_one.id])
            again = await service.replace_parent_students(db, school.id, parent.id, [student_one.id])
            assert result == again
            count = len((await db.execute(select(ParentStudent).where(ParentStudent.parent_id == parent.id))).scalars().all())
            assert count == 1
        finally:
            await db.close()
            await engine.dispose()
    asyncio.run(run())
