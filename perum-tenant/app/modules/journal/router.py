"""Journal endpoints, mounted at /api/journal (legacy-compatible paths)."""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import require_teacher
from app.models import User
from app.modules.grade_import import service as import_service
from app.modules.journal import service
from app.modules.journal.schemas import (
    AddGradeRequest,
    FinalGradeRequest,
    JournalGradeDetailOut,
    JournalGradeCreateOut,
    JournalGradeDeleteOut,
    JournalGradeUpdateOut,
    JournalTeacherSubjectsOut,
    JournalTopicArchiveOut,
    JournalTopicOut,
    JournalTopicRestoreOut,
    JournalTopicsOut,
    JournalWorkTypesOut,
    LessonTemplateUpdate,
    LessonOccurrenceUpdate,
    LessonOccurrenceUpdateOut,
    TopicCreate,
    TopicUpdate,
    UpdateGradeRequest,
)
from app.modules.school_admin.service import resolve_school_id
from app.services.parsers.dtos import (
    ImportExecutionRequest,
    ImportExecutionResponse,
    ParsingPreviewResponse,
)
from app.services.parsers.standard_pdf import StandardPdfParser

router = APIRouter()


async def _school(user: User, db: AsyncSession) -> int:
    return await resolve_school_id(user, db)


@router.get("/teacher/subjects", response_model=JournalTeacherSubjectsOut)
async def teacher_subjects(user: User = Depends(require_teacher), db: AsyncSession = Depends(get_db)) -> dict:
    return await service.teacher_subjects(db, await _school(user, db), user)


@router.get("/work-types", response_model=JournalWorkTypesOut)
async def work_types(user: User = Depends(require_teacher), db: AsyncSession = Depends(get_db)) -> dict:
    return {"success": True, "work_types": await service.list_work_types(db, await _school(user, db))}


@router.get("/subjects")
async def subjects(user: User = Depends(require_teacher), db: AsyncSession = Depends(get_db)) -> dict:
    return {"subjects": await service.list_subjects(db, await _school(user, db))}


@router.get("/subjects/{subject_id}/topics", response_model=JournalTopicsOut)
async def subject_topics(
    subject_id: int, user: User = Depends(require_teacher), db: AsyncSession = Depends(get_db)
) -> dict:
    return {"topics": await service.list_topics(db, await _school(user, db), subject_id)}


@router.post("/subjects/{subject_id}/topics", response_model=JournalTopicOut)
async def create_topic(
    subject_id: int,
    payload: TopicCreate,
    user: User = Depends(require_teacher),
    db: AsyncSession = Depends(get_db),
) -> dict:
    return await service.create_topic(db, await _school(user, db), subject_id, payload.name, user)


@router.put("/topics/{topic_id}", response_model=JournalTopicOut)
async def update_topic(
    topic_id: int,
    payload: TopicUpdate,
    user: User = Depends(require_teacher),
    db: AsyncSession = Depends(get_db),
) -> dict:
    return await service.update_topic(db, await _school(user, db), topic_id, payload.name, user)


@router.delete("/topics/{topic_id}", response_model=JournalTopicArchiveOut)
async def delete_topic(
    topic_id: int,
    user: User = Depends(require_teacher),
    db: AsyncSession = Depends(get_db),
) -> dict:
    return await service.delete_topic(db, await _school(user, db), topic_id, user)


@router.post("/topics/{topic_id}/restore", response_model=JournalTopicRestoreOut)
async def restore_topic(topic_id: int, user: User = Depends(require_teacher), db: AsyncSession = Depends(get_db)) -> dict:
    return await service.restore_topic(db, await _school(user, db), topic_id, user)


@router.put("/{class_id}/{subject_id}/lesson-templates/{lesson_date}")
async def set_lesson_template(
    class_id: int,
    subject_id: int,
    lesson_date: str,
    payload: LessonTemplateUpdate,
    user: User = Depends(require_teacher),
    db: AsyncSession = Depends(get_db),
) -> dict:
    return await service.set_lesson_template(
        db, await _school(user, db), class_id, subject_id, lesson_date, payload, user
    )


@router.delete("/{class_id}/{subject_id}/lesson-templates/{lesson_date}")
async def clear_lesson_template(
    class_id: int,
    subject_id: int,
    lesson_date: str,
    lesson_number: int | None = None,
    user: User = Depends(require_teacher),
    db: AsyncSession = Depends(get_db),
) -> dict:
    return await service.clear_lesson_template(
        db, await _school(user, db), class_id, subject_id, lesson_date, lesson_number, user
    )


@router.patch("/lesson-occurrences/{occurrence_id}", response_model=LessonOccurrenceUpdateOut)
async def update_lesson_occurrence(
    occurrence_id: int,
    payload: LessonOccurrenceUpdate,
    user: User = Depends(require_teacher),
    db: AsyncSession = Depends(get_db),
) -> dict:
    return await service.update_lesson_occurrence(
        db, await _school(user, db), occurrence_id, payload, user
    )


@router.post("/grades", response_model=JournalGradeCreateOut)
async def add_grade(
    payload: AddGradeRequest, user: User = Depends(require_teacher), db: AsyncSession = Depends(get_db)
) -> dict:
    return await service.add_grade(db, await _school(user, db), payload, user)


@router.get("/grades/{grade_id}", response_model=JournalGradeDetailOut)
async def get_grade(
    grade_id: int, user: User = Depends(require_teacher), db: AsyncSession = Depends(get_db)
) -> dict:
    return await service.get_grade(db, await _school(user, db), grade_id, user)


@router.put("/grades/{grade_id}", response_model=JournalGradeUpdateOut)
async def update_grade(
    grade_id: int,
    payload: UpdateGradeRequest,
    user: User = Depends(require_teacher),
    db: AsyncSession = Depends(get_db),
) -> dict:
    return await service.update_grade(db, await _school(user, db), grade_id, payload, user)


@router.delete("/grades/{grade_id}", response_model=JournalGradeDeleteOut)
async def delete_grade(
    grade_id: int,
    version: int,
    user: User = Depends(require_teacher),
    db: AsyncSession = Depends(get_db),
) -> dict:
    return await service.delete_grade(db, await _school(user, db), grade_id, version, user)


@router.post("/grades/final/{class_id}/{subject_id}")
async def set_final_grade(
    class_id: int,
    subject_id: int,
    payload: FinalGradeRequest,
    user: User = Depends(require_teacher),
    db: AsyncSession = Depends(get_db),
) -> dict:
    return await service.set_final_grade(
        db, await _school(user, db), class_id, subject_id, payload, user
    )


@router.delete("/grades/final/{final_grade_id}")
async def delete_final_grade(
    final_grade_id: int,
    user: User = Depends(require_teacher),
    db: AsyncSession = Depends(get_db),
) -> dict:
    return await service.delete_final_grade(
        db, await _school(user, db), final_grade_id, user
    )


async def _require_assigned(db: AsyncSession, user: User, class_id: int, subject_id: int) -> None:
    if not await service._assigned(db, user, class_id, subject_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Вы не ведёте этот предмет в данном классе")


@router.post("/import/analyze/{class_id}/{subject_id}", response_model=ParsingPreviewResponse)
async def import_analyze(
    class_id: int,
    subject_id: int,
    file: UploadFile = File(...),
    user: User = Depends(require_teacher),
    db: AsyncSession = Depends(get_db),
) -> ParsingPreviewResponse:
    school_id = await _school(user, db)
    await _require_assigned(db, user, class_id, subject_id)
    if file.content_type != "application/pdf":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Поддерживаются только PDF файлы")
    data = await file.read()
    if not data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Файл пуст")
    try:
        preview = StandardPdfParser().parse_preview(data)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))
    return await import_service.validate_preview(db, school_id, preview, class_id, subject_id)


@router.post("/import/execute/{class_id}/{subject_id}", response_model=ImportExecutionResponse)
async def import_execute(
    class_id: int,
    subject_id: int,
    file: UploadFile = File(...),
    mapping: str = Form(...),
    user: User = Depends(require_teacher),
    db: AsyncSession = Depends(get_db),
) -> ImportExecutionResponse:
    school_id = await _school(user, db)
    await _require_assigned(db, user, class_id, subject_id)
    try:
        mapping_dict = json.loads(mapping)
        request_obj = ImportExecutionRequest(mapping=mapping_dict)
    except Exception:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Неверный формат маппинга JSON")
    data = await file.read()
    try:
        preview = StandardPdfParser().parse_preview(data)
        response = await import_service.execute_import(
            db, school_id, preview, request_obj, class_id, subject_id, user.id
        )
        await db.commit()
        return response
    except HTTPException:
        await db.rollback()
        raise
    except Exception:
        await db.rollback()
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Ошибка импорта. Проверьте логи.")


# Catch-all two-segment route — must stay LAST so /grades, /subjects, etc. match first.
@router.get("/{class_id}/{subject_id}")
async def journal(
    class_id: int,
    subject_id: int,
    period_id: int | None = None,
    user: User = Depends(require_teacher),
    db: AsyncSession = Depends(get_db),
) -> dict:
    return await service.get_journal(db, await _school(user, db), class_id, subject_id, period_id, user)
