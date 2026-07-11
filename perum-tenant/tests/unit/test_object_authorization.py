import asyncio

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.db import Base
from app.models import Organization, ParentStudent, School, User
from app.models.academic import Class, ClassStudent, Subject, TeacherSubject
from app.modules.coursework.service import _allowed_class_ids, _scoped_class_ids
from app.modules.parent.service import _ensure_link
from app.modules.teacher.service import class_students


async def _seed():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    session = async_sessionmaker(engine, expire_on_commit=False)()
    org = Organization(slug="test", name="Test")
    session.add(org)
    await session.flush()
    school = School(org_id=org.id, name="One")
    other_school = School(org_id=org.id, name="Two")
    session.add_all([school, other_school])
    await session.flush()

    def user(role, school_id, login, active=True):
        return User(
            role=role,
            school_id=school_id,
            login=login,
            password_hash="x",
            is_active=active,
        )

    teacher = user("teacher", school.id, "teacher")
    parent = user("parent", school.id, "parent")
    student = user("student", school.id, "student")
    inactive_student = user("student", school.id, "inactive", False)
    foreign_student = user("student", other_school.id, "foreign")
    session.add_all([teacher, parent, student, inactive_student, foreign_student])
    await session.flush()
    assigned = Class(school_id=school.id, name="Assigned")
    homeroom = Class(school_id=school.id, name="Homeroom", teacher_id=teacher.id)
    forbidden = Class(school_id=school.id, name="Forbidden")
    foreign = Class(school_id=other_school.id, name="Foreign", teacher_id=teacher.id)
    session.add_all([assigned, homeroom, forbidden, foreign])
    subject = Subject(school_id=school.id, name="Math")
    session.add(subject)
    await session.flush()
    session.add(TeacherSubject(
        school_id=school.id,
        teacher_id=teacher.id,
        subject_id=subject.id,
        class_id=assigned.id,
    ))
    session.add_all([
        ClassStudent(class_id=assigned.id, student_id=student.id),
        ClassStudent(class_id=homeroom.id, student_id=inactive_student.id),
        ClassStudent(class_id=foreign.id, student_id=foreign_student.id),
        ParentStudent(parent_id=parent.id, student_id=student.id),
        ParentStudent(parent_id=parent.id, student_id=inactive_student.id),
        ParentStudent(parent_id=parent.id, student_id=foreign_student.id),
    ])
    await session.commit()
    return engine, session, school, teacher, parent, student, inactive_student, foreign_student, assigned, homeroom, forbidden, foreign


def test_teacher_roster_requires_assignment_or_homeroom_and_school() -> None:
    async def run():
        data = await _seed()
        engine, db, school, teacher, *_, assigned, homeroom, forbidden, foreign = data
        try:
            assert [row["id"] for row in await class_students(db, school.id, teacher, assigned.id)]
            assert await class_students(db, school.id, teacher, homeroom.id) == []
            for class_id in (forbidden.id, foreign.id):
                with pytest.raises(HTTPException) as exc:
                    await class_students(db, school.id, teacher, class_id)
                assert exc.value.status_code == 403
        finally:
            await db.close()
            await engine.dispose()

    asyncio.run(run())


def test_coursework_scope_uses_role_classes_and_requested_class_only_narrows() -> None:
    async def run():
        data = await _seed()
        engine, db, school, teacher, parent, student, _, _, assigned, homeroom, forbidden, _ = data
        try:
            assert await _allowed_class_ids(db, school.id, teacher) == {assigned.id, homeroom.id}
            assert await _allowed_class_ids(db, school.id, student) == {assigned.id}
            assert await _allowed_class_ids(db, school.id, parent) == {assigned.id}
            assert await _scoped_class_ids(db, school.id, teacher, forbidden.id) == set()
            unsupported = User(role="org_admin", login="org", password_hash="x", is_active=True)
            with pytest.raises(HTTPException) as exc:
                await _allowed_class_ids(db, school.id, unsupported)
            assert exc.value.status_code == 403
        finally:
            await db.close()
            await engine.dispose()

    asyncio.run(run())


def test_parent_link_requires_active_same_school_parent_and_student() -> None:
    async def run():
        data = await _seed()
        engine, db, school, _, parent, student, inactive, foreign, *_ = data
        try:
            await _ensure_link(db, school.id, parent, student.id)
            for child in (inactive, foreign):
                with pytest.raises(HTTPException) as exc:
                    await _ensure_link(db, school.id, parent, child.id)
                assert exc.value.status_code == 403
            parent.is_active = False
            with pytest.raises(HTTPException):
                await _ensure_link(db, school.id, parent, student.id)
        finally:
            await db.close()
            await engine.dispose()

    asyncio.run(run())
