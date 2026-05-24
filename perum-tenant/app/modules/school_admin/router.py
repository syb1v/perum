"""School-admin endpoints, mounted at /api/admin (legacy-compatible paths)."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import require_admin
from app.models import User
from app.modules.school_admin import service
from app.modules.school_admin.schemas import (
    SubjectCreate,
    SubjectUpdate,
    WorkTypeCreate,
    WorkTypeUpdate,
)

router = APIRouter()


# ---- Dashboard ----
@router.get("/dashboard/overview")
async def dashboard_overview(
    period_days: int = 30,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    school_id = await service.resolve_school_id(user, db)
    return await service.dashboard_overview(db, school_id, period_days)


# ---- Subjects ----
@router.get("/subjects")
async def get_subjects(
    user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)
) -> dict:
    school_id = await service.resolve_school_id(user, db)
    return {"subjects": await service.list_subjects(db, school_id)}


@router.post("/subjects")
async def create_subject(
    payload: SubjectCreate,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    school_id = await service.resolve_school_id(user, db)
    s = await service.create_subject(db, school_id, payload)
    return {
        "success": True,
        "message": "Предмет создан",
        "subject": {"id": s.id, "name": s.name, "short_name": s.short_name, "category": s.category},
    }


@router.put("/subjects/{subject_id}")
async def update_subject(
    subject_id: int,
    payload: SubjectUpdate,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    school_id = await service.resolve_school_id(user, db)
    await service.update_subject(db, school_id, subject_id, payload)
    return {"success": True, "message": "Предмет обновлён"}


@router.delete("/subjects/{subject_id}")
async def delete_subject(
    subject_id: int,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    school_id = await service.resolve_school_id(user, db)
    await service.delete_subject(db, school_id, subject_id)
    return {"success": True, "message": "Предмет удалён"}


# ---- Work types ----
@router.get("/work-types")
async def get_work_types(
    user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)
) -> dict:
    school_id = await service.resolve_school_id(user, db)
    return {"success": True, "work_types": await service.list_work_types(db, school_id)}


@router.post("/work-types")
async def create_work_type(
    payload: WorkTypeCreate,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    school_id = await service.resolve_school_id(user, db)
    wt = await service.create_work_type(db, school_id, payload)
    return {"success": True, "message": "Вид работы создан", "id": wt.id}


@router.put("/work-types/{work_type_id}")
async def update_work_type(
    work_type_id: int,
    payload: WorkTypeUpdate,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    school_id = await service.resolve_school_id(user, db)
    await service.update_work_type(db, school_id, work_type_id, payload)
    return {"success": True, "message": "Вид работы обновлён"}


@router.delete("/work-types/{work_type_id}")
async def delete_work_type(
    work_type_id: int,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    school_id = await service.resolve_school_id(user, db)
    await service.delete_work_type(db, school_id, work_type_id)
    return {"success": True, "message": "Вид работы удалён"}
