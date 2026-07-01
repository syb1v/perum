"""Homework & control-work endpoints, mounted directly under /api (legacy paths).

Reads (GET) are open to any authenticated user — students get their own class's
items. Writes require a teacher assigned to the class+subject (admins bypass).
"""

from __future__ import annotations

import os

from fastapi import APIRouter, Depends, File, Form, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import get_current_user, require_teacher
from app.models import User
from app.modules.coursework import service
from app.modules.coursework.schemas import ControlWorkCreate, HomeworkCreate, HomeworkUpdate
from app.modules.school_admin.service import resolve_school_id

router = APIRouter()


async def _school(user: User, db: AsyncSession) -> int:
    return await resolve_school_id(user, db)


# ---- homework ----
@router.get("/homework")
async def list_homework(
    class_id: int | None = None,
    subject_id: int | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    return await service.list_homework(db, await _school(user, db), user, class_id, subject_id)


@router.post("/homework")
async def create_homework(
    payload: HomeworkCreate, user: User = Depends(require_teacher), db: AsyncSession = Depends(get_db)
) -> dict:
    return await service.create_homework(db, await _school(user, db), payload, user)


@router.put("/homework/{homework_id}")
async def update_homework(
    homework_id: int,
    payload: HomeworkUpdate,
    user: User = Depends(require_teacher),
    db: AsyncSession = Depends(get_db),
) -> dict:
    return await service.update_homework(db, await _school(user, db), homework_id, payload, user)


@router.delete("/homework/{homework_id}")
async def delete_homework(
    homework_id: int, user: User = Depends(require_teacher), db: AsyncSession = Depends(get_db)
) -> dict:
    return await service.delete_homework(db, await _school(user, db), homework_id, user)


@router.post("/homework/{homework_id}/attachments")
async def add_attachment(
    homework_id: int,
    file: UploadFile | None = File(None),
    url_link: str | None = Form(None),
    user: User = Depends(require_teacher),
    db: AsyncSession = Depends(get_db),
) -> dict:
    return await service.add_attachment(db, await _school(user, db), homework_id, user, file, url_link)


@router.delete("/homework/attachments/{attachment_id}")
async def delete_attachment(
    attachment_id: int, user: User = Depends(require_teacher), db: AsyncSession = Depends(get_db)
) -> dict:
    return await service.delete_attachment(db, await _school(user, db), attachment_id, user)


@router.get("/attachments/{attachment_id}/download")
async def download_attachment(
    attachment_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    att = await service.get_attachment_file(db, await _school(user, db), attachment_id)
    return FileResponse(att.file_path, filename=att.filename or os.path.basename(att.file_path))


# ---- control works ----
@router.get("/control-works")
async def list_control_works(
    class_id: int | None = None,
    subject_id: int | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    return await service.list_control_works(db, await _school(user, db), user, class_id, subject_id)


@router.post("/control-works")
async def create_control_work(
    payload: ControlWorkCreate, user: User = Depends(require_teacher), db: AsyncSession = Depends(get_db)
) -> dict:
    return await service.create_control_work(db, await _school(user, db), payload, user)


@router.delete("/control-works/{work_id}")
async def delete_control_work(
    work_id: int, user: User = Depends(require_teacher), db: AsyncSession = Depends(get_db)
) -> dict:
    return await service.delete_control_work(db, await _school(user, db), work_id, user)
