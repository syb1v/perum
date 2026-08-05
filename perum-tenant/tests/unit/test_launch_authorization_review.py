import asyncio
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException

from app.core.time import utc_now
from app.models import User
from app.models.academic import Subject, TeacherSubject
from app.models.journal import Homework, HomeworkAttachment
from app.modules.analytics.service import get_accessible_class
from app.modules.coursework.schemas import HomeworkCreate, HomeworkUpdate
from app.modules.coursework.service import create_homework, get_attachment_file, update_homework
from tests.unit.test_homework_semantics import _seed


def test_launch_authorization_boundaries_are_fail_closed(tmp_path):
    async def run():
        engine, db, school, _, student, cls, subject, _, _ = await _seed()
        try:
            teacher = User(school_id=school.id, role="teacher", login="scoped-teacher", password_hash="x")
            other_subject = Subject(school_id=school.id, name="Private subject")
            db.add_all([teacher, other_subject])
            await db.flush()
            assignment = TeacherSubject(
                school_id=school.id,
                teacher_id=teacher.id,
                class_id=cls.id,
                subject_id=subject.id,
            )
            db.add(assignment)
            await db.commit()

            assert await get_accessible_class(db, cls.id, teacher, school.id, subject.id) == cls
            for forbidden_subject in (None, other_subject.id):
                with pytest.raises(HTTPException) as denied:
                    await get_accessible_class(db, cls.id, teacher, school.id, forbidden_subject)
                assert denied.value.status_code == 403

            created = await create_homework(db, school.id, HomeworkCreate(
                class_id=cls.id,
                subject_id=subject.id,
                title="Draft attachment",
                published_at=datetime.now(timezone.utc) + timedelta(days=1),
            ), teacher)
            homework = await db.get(Homework, created["homework_id"])
            attachment_path = tmp_path / "draft.txt"
            attachment_path.write_text("private draft")
            attachment = HomeworkAttachment(
                homework_id=homework.id,
                filename="draft.txt",
                file_path=str(attachment_path),
                expires_at=datetime.now() + timedelta(days=2),
            )
            db.add(attachment)
            await db.commit()
            await db.refresh(attachment)

            with pytest.raises(HTTPException) as hidden:
                await get_attachment_file(db, school.id, attachment.id, student)
            assert hidden.value.status_code == 404

            homework.published_at = utc_now() - timedelta(seconds=1)
            await db.commit()
            assert await get_attachment_file(db, school.id, attachment.id, student) == attachment

            await db.delete(assignment)
            await db.commit()
            with pytest.raises(HTTPException) as revoked:
                await update_homework(
                    db,
                    school.id,
                    homework.id,
                    HomeworkUpdate(title="Unauthorized change"),
                    teacher,
                )
            assert revoked.value.status_code == 403
        finally:
            await db.close()
            await engine.dispose()

    asyncio.run(run())
