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
from app.modules.journal.schemas import AddGradeRequest, UpdateGradeRequest
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


@router.get("/teacher/subjects")
async def teacher_subjects(user: User = Depends(require_teacher), db: AsyncSession = Depends(get_db)) -> dict:
    return await service.teacher_subjects(db, await _school(user, db), user)


@router.get("/work-types")
async def work_types(user: User = Depends(require_teacher), db: AsyncSession = Depends(get_db)) -> dict:
    return {"success": True, "work_types": await service.list_work_types(db, await _school(user, db))}


@router.get("/subjects")
async def subjects(user: User = Depends(require_teacher), db: AsyncSession = Depends(get_db)) -> dict:
    return {"subjects": await service.list_subjects(db, await _school(user, db))}


@router.get("/subjects/{subject_id}/topics")
async def subject_topics(
    subject_id: int, user: User = Depends(require_teacher), db: AsyncSession = Depends(get_db)
) -> dict:
    return {"topics": await service.list_topics(db, await _school(user, db), subject_id)}


@router.post("/grades")
async def add_grade(
    payload: AddGradeRequest, user: User = Depends(require_teacher), db: AsyncSession = Depends(get_db)
) -> dict:
    return await service.add_grade(db, await _school(user, db), payload, user)


@router.get("/grades/{grade_id}")
async def get_grade(
    grade_id: int, user: User = Depends(require_teacher), db: AsyncSession = Depends(get_db)
) -> dict:
    return await service.get_grade(db, await _school(user, db), grade_id)


@router.put("/grades/{grade_id}")
async def update_grade(
    grade_id: int,
    payload: UpdateGradeRequest,
    user: User = Depends(require_teacher),
    db: AsyncSession = Depends(get_db),
) -> dict:
    return await service.update_grade(db, await _school(user, db), grade_id, payload, user)


@router.delete("/grades/{grade_id}")
async def delete_grade(
    grade_id: int, user: User = Depends(require_teacher), db: AsyncSession = Depends(get_db)
) -> dict:
    return await service.delete_grade(db, await _school(user, db), grade_id, user)


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
