import asyncio

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.db import Base
from app.models import Organization, School, User
from app.models.academic import Class, Subject, Topic
from app.modules.journal.service import list_subjects, list_topics, restore_topic
from app.modules.school_admin.service import delete_subject, restore_subject
from app.modules.coursework.schemas import HomeworkCreate
from app.modules.coursework.service import create_homework


def test_subject_and_topics_are_archived_without_deletion_and_restored_explicitly():
    async def run():
        engine = create_async_engine("sqlite+aiosqlite:///:memory:")
        async with engine.begin() as connection: await connection.run_sync(Base.metadata.create_all)
        db = async_sessionmaker(engine, expire_on_commit=False)()
        org = Organization(slug="archive", name="Archive"); db.add(org); await db.flush()
        school = School(org_id=org.id, name="School"); db.add(school); await db.flush()
        admin = User(school_id=school.id, role="school_admin", login="archive-admin", password_hash="x"); subject = Subject(school_id=school.id, name="History", in_exchange=True); cls = Class(school_id=school.id, name="5A")
        db.add_all([admin, subject, cls]); await db.flush(); topic = Topic(school_id=school.id, subject_id=subject.id, name="Ancient"); db.add(topic); await db.commit()
        await delete_subject(db, school.id, subject.id, admin.id)
        await db.refresh(subject); await db.refresh(topic)
        assert subject.is_archived and topic.is_archived and not subject.in_exchange
        assert await db.get(Subject, subject.id) is not None
        assert await list_subjects(db, school.id) == []
        with pytest.raises(HTTPException) as coursework:
            await create_homework(db, school.id, HomeworkCreate(class_id=cls.id, subject_id=subject.id, title="Blocked"), admin)
        assert coursework.value.status_code == 404
        with pytest.raises(HTTPException) as hidden: await list_topics(db, school.id, subject.id)
        assert hidden.value.status_code == 404
        with pytest.raises(HTTPException) as blocked: await restore_topic(db, school.id, topic.id, admin)
        assert blocked.value.status_code == 409
        await restore_subject(db, school.id, subject.id)
        assert await list_subjects(db, school.id)
        await restore_topic(db, school.id, topic.id, admin)
        assert (await list_topics(db, school.id, subject.id))[0]["name"] == "Ancient"
        await db.close(); await engine.dispose()
    asyncio.run(run())
