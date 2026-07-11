import asyncio
from datetime import date

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.db import Base
from app.models import Organization, School
from app.models.academic import Class, Schedule, Subject
from app.models.journal import LessonTemplate
from app.modules.academic.occurrences import get_or_create_occurrence


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
