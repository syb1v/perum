import asyncio
from datetime import date, datetime

from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.db import Base
from app.models import Organization, School, User
from app.models.academic import Class, Schedule, Subject
from app.models.journal import Grade, Homework, LessonTemplate
from app.modules.academic.backfill import apply_plan, build_plan
from fastapi import HTTPException
import pytest


def test_backfill_links_only_unambiguous_groups_and_reports_homework():
    async def run():
        engine = create_async_engine("sqlite+aiosqlite:///:memory:")
        async with engine.begin() as connection: await connection.run_sync(Base.metadata.create_all)
        db = async_sessionmaker(engine, expire_on_commit=False)()
        org = Organization(slug="backfill", name="Backfill"); db.add(org); await db.flush()
        school = School(org_id=org.id, name="School"); db.add(school); await db.flush()
        student = User(school_id=school.id, role="student", login="backfill-student", password_hash="x")
        cls = Class(school_id=school.id, name="5A"); subject = Subject(school_id=school.id, name="Math")
        db.add_all([student, cls, subject]); await db.flush()
        lesson_date = date(2026, 7, 13)
        db.add(Schedule(school_id=school.id, class_id=cls.id, subject_id=subject.id, day_of_week=lesson_date.weekday(), lesson_number=2)); await db.flush()
        grade = Grade(school_id=school.id, student_id=student.id, class_id=cls.id, subject_id=subject.id, lesson_date=datetime.combine(lesson_date, datetime.min.time()))
        template = LessonTemplate(school_id=school.id, class_id=cls.id, subject_id=subject.id, lesson_date=lesson_date)
        homework = Homework(school_id=school.id, class_id=cls.id, subject_id=subject.id, title="Legacy", due_date=datetime.combine(lesson_date, datetime.min.time()))
        db.add_all([grade, template, homework]); await db.commit()
        preview = await build_plan(db, school.id)
        assert preview["summary"]["safe_groups"] == 1
        assert any(item["reason"] == "unsupported_homework_semantics" for item in preview["ambiguities"])
        with pytest.raises(HTTPException) as missing_ack: await apply_plan(db, school.id, preview["plan_token"])
        assert missing_ack.value.detail["code"] == "AMBIGUITY_REPORT_ACK_REQUIRED"
        with pytest.raises(HTTPException) as changed_ack: await apply_plan(db, school.id, preview["plan_token"], "sha256:" + "0" * 64)
        assert changed_ack.value.detail["code"] == "AMBIGUITY_REPORT_CHANGED"
        result = await apply_plan(db, school.id, preview["plan_token"], preview["ambiguity_token"])
        assert result == {**result, "applied": True, "occurrences_created": 1, "rows_linked": 2}
        await db.refresh(grade); await db.refresh(template); await db.refresh(homework)
        assert grade.occurrence_id == template.occurrence_id
        assert homework.target_occurrence_id is None
        repeated = await build_plan(db, school.id)
        assert repeated["summary"]["safe_groups"] == 0
        await db.close(); await engine.dispose()
    asyncio.run(run())


def test_backfill_reports_multiple_schedule_candidates_without_writes():
    async def run():
        engine = create_async_engine("sqlite+aiosqlite:///:memory:")
        async with engine.begin() as connection: await connection.run_sync(Base.metadata.create_all)
        db = async_sessionmaker(engine, expire_on_commit=False)()
        org = Organization(slug="ambiguous", name="Ambiguous"); db.add(org); await db.flush()
        school = School(org_id=org.id, name="School"); db.add(school); await db.flush()
        student = User(school_id=school.id, role="student", login="ambiguous-student", password_hash="x")
        cls = Class(school_id=school.id, name="5A"); subject = Subject(school_id=school.id, name="Math"); db.add_all([student, cls, subject]); await db.flush()
        lesson_date = date(2026, 7, 13)
        db.add_all([Schedule(school_id=school.id, class_id=cls.id, subject_id=subject.id, day_of_week=lesson_date.weekday(), lesson_number=2), Schedule(school_id=school.id, class_id=cls.id, subject_id=subject.id, day_of_week=lesson_date.weekday(), lesson_number=4), Grade(school_id=school.id, student_id=student.id, class_id=cls.id, subject_id=subject.id, lesson_date=datetime.combine(lesson_date, datetime.min.time()))]); await db.commit()
        preview = await build_plan(db, school.id)
        assert preview["summary"]["safe_groups"] == 0
        assert preview["ambiguities"][0]["reason"] == "multiple_schedule_candidates"
        await db.close(); await engine.dispose()
    asyncio.run(run())


def test_backfill_detects_plan_change_and_metadata_conflict():
    async def run():
        engine = create_async_engine("sqlite+aiosqlite:///:memory:")
        async with engine.begin() as connection: await connection.run_sync(Base.metadata.create_all)
        db = async_sessionmaker(engine, expire_on_commit=False)()
        org = Organization(slug="changed", name="Changed"); db.add(org); await db.flush()
        school = School(org_id=org.id, name="School"); db.add(school); await db.flush()
        student = User(school_id=school.id, role="student", login="changed-student", password_hash="x")
        cls = Class(school_id=school.id, name="5A"); subject = Subject(school_id=school.id, name="Math"); db.add_all([student, cls, subject]); await db.flush()
        lesson_date = date(2026, 7, 13)
        schedule = Schedule(school_id=school.id, class_id=cls.id, subject_id=subject.id, day_of_week=lesson_date.weekday(), lesson_number=2)
        grade = Grade(school_id=school.id, student_id=student.id, class_id=cls.id, subject_id=subject.id, lesson_date=datetime.combine(lesson_date, datetime.min.time()), topic_id=1)
        template = LessonTemplate(school_id=school.id, class_id=cls.id, subject_id=subject.id, lesson_date=lesson_date, topic_id=2)
        db.add_all([schedule, grade, template]); await db.commit()
        conflicted = await build_plan(db, school.id)
        assert conflicted["ambiguities"][0]["reason"] == "metadata_conflict"
        grade.topic_id = None; template.topic_id = None; await db.commit()
        preview = await build_plan(db, school.id)
        schedule.lesson_number = 3; await db.commit()
        with pytest.raises(HTTPException) as changed: await apply_plan(db, school.id, preview["plan_token"])
        assert changed.value.detail["code"] == "BACKFILL_PLAN_CHANGED"
        await db.close(); await engine.dispose()
    asyncio.run(run())
