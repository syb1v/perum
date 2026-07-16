import asyncio
from datetime import date, datetime

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.db import Base
from app.models import Organization, School, User
from app.models.academic import Class, LessonOccurrence, Schedule, Subject
from app.models.journal import ControlWork, Grade, LessonTemplate
from app.modules.academic.occurrences import get_or_create_occurrence
from app.modules.journal.schemas import LessonOccurrenceUpdate
from app.modules.journal.service import update_lesson_occurrence


def test_occurrence_is_idempotent_and_validates_schedule() -> None:
    async def run():
        engine = create_async_engine("sqlite+aiosqlite:///:memory:")
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        db = async_sessionmaker(engine, expire_on_commit=False)()
        try:
            org = Organization(slug="occurrences", name="Occurrences")
            db.add(org)
            await db.flush()
            school = School(org_id=org.id, name="School")
            db.add(school)
            await db.flush()
            cls = Class(school_id=school.id, name="5A")
            subject = Subject(school_id=school.id, name="Math")
            db.add_all([cls, subject])
            await db.flush()
            lesson_date = date(2026, 7, 13)
            db.add(Schedule(
                school_id=school.id, class_id=cls.id, subject_id=subject.id,
                day_of_week=lesson_date.weekday(), lesson_number=2,
            ))
            await db.flush()
            first = await get_or_create_occurrence(
                db, school.id, cls.id, subject.id, lesson_date, 2
            )
            second = await get_or_create_occurrence(
                db, school.id, cls.id, subject.id, lesson_date, 2
            )
            assert first.id == second.id
            assert first.schedule_id is not None
            with pytest.raises(HTTPException) as error:
                await get_or_create_occurrence(
                    db, school.id, cls.id, subject.id, lesson_date, 3
                )
            assert error.value.status_code == 400
        finally:
            await db.close()
            await engine.dispose()

    asyncio.run(run())


def test_templates_are_unique_per_occurrence_not_subject_date() -> None:
    async def run():
        engine = create_async_engine("sqlite+aiosqlite:///:memory:")
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        db = async_sessionmaker(engine, expire_on_commit=False)()
        try:
            org = Organization(slug="template-slots", name="Template slots")
            db.add(org)
            await db.flush()
            school = School(org_id=org.id, name="School")
            db.add(school)
            await db.flush()
            cls = Class(school_id=school.id, name="5A")
            subject = Subject(school_id=school.id, name="Math")
            db.add_all([cls, subject])
            await db.flush()
            lesson_date = date(2026, 7, 13)
            db.add_all([
                Schedule(school_id=school.id, class_id=cls.id, subject_id=subject.id,
                         day_of_week=lesson_date.weekday(), lesson_number=2),
                Schedule(school_id=school.id, class_id=cls.id, subject_id=subject.id,
                         day_of_week=lesson_date.weekday(), lesson_number=3),
            ])
            await db.flush()
            first = await get_or_create_occurrence(db, school.id, cls.id, subject.id, lesson_date, 2)
            second = await get_or_create_occurrence(db, school.id, cls.id, subject.id, lesson_date, 3)
            db.add_all([
                LessonTemplate(school_id=school.id, class_id=cls.id, subject_id=subject.id,
                               occurrence_id=first.id, lesson_date=lesson_date),
                LessonTemplate(school_id=school.id, class_id=cls.id, subject_id=subject.id,
                               occurrence_id=second.id, lesson_date=lesson_date),
            ])
            await db.commit()
        finally:
            await db.close()
            await engine.dispose()

    asyncio.run(run())


def test_occurrence_transfer_preserves_identity_and_updates_lesson_dates() -> None:
    async def run():
        engine = create_async_engine("sqlite+aiosqlite:///:memory:")
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        db = async_sessionmaker(engine, expire_on_commit=False)()
        try:
            org = Organization(slug="occurrence-transfer", name="Occurrence transfer")
            db.add(org)
            await db.flush()
            school = School(org_id=org.id, name="School")
            db.add(school)
            await db.flush()
            admin = User(school_id=school.id, role="school_admin", login="transfer-admin", password_hash="x")
            student = User(school_id=school.id, role="student", login="transfer-student", password_hash="x")
            cls = Class(school_id=school.id, name="5A")
            subject = Subject(school_id=school.id, name="Math")
            db.add_all([admin, student, cls, subject])
            await db.flush()
            original_date = date(2026, 7, 13)
            new_date = date(2026, 7, 14)
            schedule = Schedule(
                school_id=school.id, class_id=cls.id, subject_id=subject.id,
                day_of_week=original_date.weekday(), lesson_number=2,
            )
            db.add(schedule)
            await db.flush()
            occurrence = await get_or_create_occurrence(
                db, school.id, cls.id, subject.id, original_date, 2
            )
            original_id = occurrence.id
            original_schedule_id = occurrence.schedule_id
            template = LessonTemplate(
                school_id=school.id, class_id=cls.id, subject_id=subject.id,
                occurrence_id=occurrence.id, lesson_date=original_date,
            )
            grade = Grade(
                school_id=school.id, student_id=student.id, teacher_id=admin.id,
                class_id=cls.id, subject_id=subject.id, occurrence_id=occurrence.id,
                lesson_date=datetime.combine(original_date, datetime.min.time()),
            )
            control = ControlWork(
                school_id=school.id, class_id=cls.id, subject_id=subject.id,
                occurrence_id=occurrence.id, teacher_id=admin.id, title="Test",
                work_date=datetime.combine(original_date, datetime.min.time()),
            )
            db.add_all([template, grade, control])
            await db.commit()

            result = await update_lesson_occurrence(
                db, school.id, occurrence.id,
                LessonOccurrenceUpdate(version=1, lesson_date=new_date, lesson_number=4),
                admin,
            )

            await db.refresh(occurrence)
            await db.refresh(template)
            await db.refresh(grade)
            await db.refresh(control)
            assert occurrence.id == original_id
            assert occurrence.schedule_id == original_schedule_id
            assert occurrence.lesson_date == new_date
            assert occurrence.lesson_number == 4
            assert occurrence.version == 2
            assert template.lesson_date == new_date
            assert grade.lesson_date.date() == new_date
            assert control.work_date.date() == new_date
            assert result["version"] == 2
        finally:
            await db.close()
            await engine.dispose()

    asyncio.run(run())


def test_occurrence_update_rejects_stale_version_and_occupied_slot() -> None:
    async def run():
        engine = create_async_engine("sqlite+aiosqlite:///:memory:")
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        db = async_sessionmaker(engine, expire_on_commit=False)()
        try:
            org = Organization(slug="occurrence-conflicts", name="Occurrence conflicts")
            db.add(org)
            await db.flush()
            school = School(org_id=org.id, name="School")
            db.add(school)
            await db.flush()
            admin = User(school_id=school.id, role="school_admin", login="conflict-admin", password_hash="x")
            cls = Class(school_id=school.id, name="5A")
            subject = Subject(school_id=school.id, name="Math")
            db.add_all([admin, cls, subject])
            await db.flush()
            first = LessonOccurrence(
                school_id=school.id, class_id=cls.id, subject_id=subject.id,
                lesson_date=date(2026, 7, 13), lesson_number=1, teacher_id=admin.id,
            )
            occupied = LessonOccurrence(
                school_id=school.id, class_id=cls.id, subject_id=subject.id,
                lesson_date=date(2026, 7, 14), lesson_number=2, teacher_id=admin.id,
            )
            db.add_all([first, occupied])
            await db.commit()
            school_id = school.id
            first_id = first.id
            occupied_date = occupied.lesson_date
            occupied_number = occupied.lesson_number

            await update_lesson_occurrence(
                db, school_id, first_id,
                LessonOccurrenceUpdate(version=1, status="completed"), admin,
            )
            with pytest.raises(HTTPException) as stale:
                await update_lesson_occurrence(
                    db, school_id, first_id,
                    LessonOccurrenceUpdate(version=1, status="cancelled"), admin,
                )
            assert stale.value.status_code == 409
            assert stale.value.detail["code"] == "LESSON_OCCURRENCE_VERSION_CONFLICT"
            await db.refresh(admin)

            with pytest.raises(HTTPException) as slot:
                await update_lesson_occurrence(
                    db, school_id, first_id,
                    LessonOccurrenceUpdate(
                        version=2, lesson_date=occupied_date,
                        lesson_number=occupied_number,
                    ),
                    admin,
                )
            assert slot.value.status_code == 409
            assert slot.value.detail["code"] == "LESSON_OCCURRENCE_SLOT_CONFLICT"
        finally:
            await db.close()
            await engine.dispose()

    asyncio.run(run())


def test_occurrence_update_conceals_cross_school_and_rejects_unassigned_teacher() -> None:
    async def run():
        engine = create_async_engine("sqlite+aiosqlite:///:memory:")
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        db = async_sessionmaker(engine, expire_on_commit=False)()
        try:
            org = Organization(slug="occurrence-access", name="Occurrence access")
            db.add(org)
            await db.flush()
            own_school = School(org_id=org.id, name="Own")
            other_school = School(org_id=org.id, name="Other")
            db.add_all([own_school, other_school])
            await db.flush()
            teacher = User(school_id=own_school.id, role="teacher", login="unassigned-teacher", password_hash="x")
            cls = Class(school_id=own_school.id, name="5A")
            subject = Subject(school_id=own_school.id, name="Math")
            db.add_all([teacher, cls, subject])
            await db.flush()
            occurrence = LessonOccurrence(
                school_id=own_school.id, class_id=cls.id, subject_id=subject.id,
                lesson_date=date(2026, 7, 13), lesson_number=1,
            )
            db.add(occurrence)
            await db.commit()

            with pytest.raises(HTTPException) as cross_school:
                await update_lesson_occurrence(
                    db, other_school.id, occurrence.id,
                    LessonOccurrenceUpdate(version=1, status="completed"), teacher,
                )
            assert cross_school.value.status_code == 404
            with pytest.raises(HTTPException) as unassigned:
                await update_lesson_occurrence(
                    db, own_school.id, occurrence.id,
                    LessonOccurrenceUpdate(version=1, status="completed"), teacher,
                )
            assert unassigned.value.status_code == 403
        finally:
            await db.close()
            await engine.dispose()

    asyncio.run(run())
