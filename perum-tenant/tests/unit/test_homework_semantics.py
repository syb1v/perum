import asyncio
from datetime import date, datetime, timezone

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.db import Base
from app.models import Organization, School, User
from app.models.academic import Class, ClassStudent, LessonOccurrence, Schedule, Subject
from app.core.time import utc_now
from app.models.journal import Homework, HomeworkStudentState
from app.modules.coursework.schemas import HomeworkCreate, HomeworkStateUpdate
from app.modules.coursework.service import create_homework, list_homework, update_homework_state


async def _seed():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    db = async_sessionmaker(engine, expire_on_commit=False)()
    org = Organization(slug="homework-semantics", name="Homework")
    db.add(org)
    await db.flush()
    school = School(org_id=org.id, name="School")
    db.add(school)
    await db.flush()
    teacher = User(school_id=school.id, role="school_admin", login="hw-admin", password_hash="x")
    student = User(school_id=school.id, role="student", login="hw-student", password_hash="x")
    cls = Class(school_id=school.id, name="5A")
    subject = Subject(school_id=school.id, name="Math")
    db.add_all([teacher, student, cls, subject])
    await db.flush()
    db.add(ClassStudent(class_id=cls.id, student_id=student.id))
    assigned = LessonOccurrence(school_id=school.id, class_id=cls.id, subject_id=subject.id, lesson_date=date(2026, 7, 16), lesson_number=1)
    target = LessonOccurrence(school_id=school.id, class_id=cls.id, subject_id=subject.id, lesson_date=date(2026, 7, 18), lesson_number=2)
    db.add_all([assigned, target])
    db.add(Schedule(school_id=school.id, class_id=cls.id, subject_id=subject.id, day_of_week=5, lesson_number=2))
    await db.commit()
    return engine, db, school, teacher, student, cls, subject, assigned, target


def test_homework_semantics_separate_occurrences_publication_and_deadline():
    async def run():
        engine, db, school, teacher, student, cls, subject, assigned, target = await _seed()
        try:
            deadline = datetime(2026, 7, 18, 8, tzinfo=timezone.utc)
            result = await create_homework(db, school.id, HomeworkCreate(
                class_id=cls.id,
                subject_id=subject.id,
                title="Draft",
                assigned_occurrence_id=assigned.id,
                target_occurrence_id=target.id,
                deadline_at=deadline,
            ), teacher)
            homework = await db.get(Homework, result["homework_id"])
            assert homework.assigned_occurrence_id == assigned.id
            assert homework.target_occurrence_id == target.id
            assert homework.occurrence_id == target.id
            assert homework.due_date is None
            assert (await list_homework(db, school.id, student, cls.id, subject.id))["homework"] == []

            homework.published_at = utc_now()
            await db.commit()
            visible = (await list_homework(db, school.id, student, cls.id, subject.id))["homework"]
            assert visible[0]["deadline_at"].startswith("2026-07-18T08:00:00")
            assert visible[0]["student_state"] == {"status": "not_started", "version": 0, "completed_at": None}
        finally:
            await db.close()
            await engine.dispose()

    asyncio.run(run())


def test_legacy_due_date_does_not_create_target_occurrence_and_state_is_versioned():
    async def run():
        engine, db, school, teacher, student, cls, subject, _, _ = await _seed()
        try:
            legacy = await create_homework(db, school.id, HomeworkCreate(
                class_id=cls.id,
                subject_id=subject.id,
                title="Legacy",
                due_date=datetime(2026, 7, 18),
                lesson_number=2,
            ), teacher)
            homework = await db.get(Homework, legacy["homework_id"])
            assert homework.occurrence_id is None
            assert homework.target_occurrence_id is None
            visible = (await list_homework(db, school.id, student, cls.id, subject.id))["homework"]
            assert [item["id"] for item in visible] == [homework.id]

            state = await update_homework_state(db, school.id, homework.id, HomeworkStateUpdate(version=0, status="completed"), student)
            assert state["version"] == 1
            assert state["completed_at"] is not None
            with pytest.raises(HTTPException) as stale:
                await update_homework_state(db, school.id, homework.id, HomeworkStateUpdate(version=0, status="in_progress"), student)
            assert stale.value.status_code == 409
            row = await db.scalar(select(HomeworkStudentState).where(HomeworkStudentState.homework_id == homework.id))
            assert row.status == "completed"
        finally:
            await db.close()
            await engine.dispose()

    asyncio.run(run())
