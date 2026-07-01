"""Analytics routers (Phase 8).

- `teacher_router` mounted at /api/teacher/analytics — per-class dashboards for
  teachers (legacy contract).
- `admin_router` mounted at /api/admin — page-visit tracking (any auth user) +
  school-wide economy/performance dashboards (admins only).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import get_current_user, require_admin, require_teacher
from app.models import User
from app.modules.analytics import service
from app.modules.school_admin.service import resolve_school_id

teacher_router = APIRouter()
admin_router = APIRouter()


# ---- Teacher analytics ---------------------------------------------------

@teacher_router.get("/dashboard")
async def teacher_dashboard(
    class_id: int,
    subject_id: int | None = None,
    period: str | None = None,
    teacher: User = Depends(require_teacher),
    db: AsyncSession = Depends(get_db),
) -> dict:
    school_id = await resolve_school_id(teacher, db)
    return await service.dashboard(db, school_id, teacher, class_id, subject_id, period)


@teacher_router.get("/topics")
async def teacher_topics(
    class_id: int,
    subject_id: int | None = None,
    period: str | None = None,
    teacher: User = Depends(require_teacher),
    db: AsyncSession = Depends(get_db),
) -> dict:
    school_id = await resolve_school_id(teacher, db)
    return await service.topics(db, school_id, teacher, class_id, subject_id, period)


@teacher_router.get("/works")
async def teacher_works(
    class_id: int,
    subject_id: int | None = None,
    period: str | None = None,
    teacher: User = Depends(require_teacher),
    db: AsyncSession = Depends(get_db),
) -> dict:
    school_id = await resolve_school_id(teacher, db)
    return await service.works(db, school_id, teacher, class_id, subject_id, period)


@teacher_router.get("/students/problem")
async def teacher_problem_students(
    class_id: int,
    subject_id: int | None = None,
    period: str | None = None,
    teacher: User = Depends(require_teacher),
    db: AsyncSession = Depends(get_db),
) -> dict:
    school_id = await resolve_school_id(teacher, db)
    return await service.problem_students(db, school_id, teacher, class_id, subject_id, period)


# ---- Admin analytics -----------------------------------------------------

class TrackRequest(BaseModel):
    path: str
    referrer: str | None = None
    user_agent: str | None = None
    is_mobile: bool = False


@admin_router.post("/analytics/track")
async def track(
    payload: TrackRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    return await service.track_visit(
        db, user, payload.path, payload.referrer, payload.user_agent, payload.is_mobile
    )


@admin_router.get("/dashboard/deep-economy")
async def deep_economy(
    period_days: int = 30,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    school_id = await resolve_school_id(admin, db)
    return await service.deep_economy(db, school_id, period_days)


@admin_router.get("/dashboard/performance")
async def performance(
    period_days: int = 30,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    school_id = await resolve_school_id(admin, db)
    return await service.performance(db, school_id, period_days)
