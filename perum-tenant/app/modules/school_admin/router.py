"""School-admin endpoints, mounted at /api/admin (legacy-compatible paths)."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import require_admin
from app.models import User
from app.modules.school_admin import (
    service,
    service_academic as acad,
    service_classes as cls,
    service_teachers as tch,
)
from app.modules.school_admin.schemas import (
    AcademicYearCreate,
    AcademicYearUpdate,
    AddStudentRequest,
    BellScheduleCreate,
    BellScheduleUpdate,
    ClassCreate,
    ClassUpdate,
    SchoolPeriodCreate,
    SchoolPeriodUpdate,
    SubjectCreate,
    SubjectUpdate,
    TeacherSubjectAssign,
    WorkTypeCreate,
    WorkTypeUpdate,
)
from app.modules.school_admin.service import resolve_school_id

router = APIRouter()


async def _school(user: User, db: AsyncSession) -> int:
    return await resolve_school_id(user, db)


# ============ Dashboard ============
@router.get("/dashboard/overview")
async def dashboard_overview(
    period_days: int = 30, user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)
) -> dict:
    return await service.dashboard_overview(db, await _school(user, db), period_days)


# ============ Subjects ============
@router.get("/subjects")
async def get_subjects(user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)) -> dict:
    return {"subjects": await service.list_subjects(db, await _school(user, db))}


@router.post("/subjects")
async def create_subject(
    payload: SubjectCreate, user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)
) -> dict:
    s = await service.create_subject(db, await _school(user, db), payload)
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
    await service.update_subject(db, await _school(user, db), subject_id, payload)
    return {"success": True, "message": "Предмет обновлён"}


@router.delete("/subjects/{subject_id}")
async def delete_subject(
    subject_id: int, user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)
) -> dict:
    await service.delete_subject(db, await _school(user, db), subject_id)
    return {"success": True, "message": "Предмет удалён"}


# ============ Work types ============
@router.get("/work-types")
async def get_work_types(user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)) -> dict:
    return {"success": True, "work_types": await service.list_work_types(db, await _school(user, db))}


@router.post("/work-types")
async def create_work_type(
    payload: WorkTypeCreate, user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)
) -> dict:
    wt = await service.create_work_type(db, await _school(user, db), payload)
    return {"success": True, "message": "Вид работы создан", "id": wt.id}


@router.put("/work-types/{work_type_id}")
async def update_work_type(
    work_type_id: int,
    payload: WorkTypeUpdate,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    await service.update_work_type(db, await _school(user, db), work_type_id, payload)
    return {"success": True, "message": "Вид работы обновлён"}


@router.delete("/work-types/{work_type_id}")
async def delete_work_type(
    work_type_id: int, user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)
) -> dict:
    await service.delete_work_type(db, await _school(user, db), work_type_id)
    return {"success": True, "message": "Вид работы удалён"}


# ============ Classes ============
@router.get("/classes")
async def get_classes(user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)) -> dict:
    return {"classes": await cls.list_classes(db, await _school(user, db))}


@router.post("/classes")
async def create_class(
    payload: ClassCreate, user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)
) -> dict:
    c = await cls.create_class(db, await _school(user, db), payload)
    return {"success": True, "message": "Класс создан", "class": {"id": c.id, "name": c.name, "teacher_id": c.teacher_id}}


@router.put("/classes/{class_id}")
async def update_class(
    class_id: int,
    payload: ClassUpdate,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    await cls.update_class(db, await _school(user, db), class_id, payload)
    return {"success": True, "message": "Класс обновлён"}


@router.delete("/classes/{class_id}")
async def delete_class(
    class_id: int, user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)
) -> dict:
    await cls.delete_class(db, await _school(user, db), class_id)
    return {"success": True, "message": "Класс удалён"}


@router.get("/classes/{class_id}/students")
async def class_students(
    class_id: int, user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)
) -> dict:
    return await cls.get_class_students(db, await _school(user, db), class_id)


@router.post("/classes/{class_id}/students")
async def add_class_student(
    class_id: int,
    payload: AddStudentRequest,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    await cls.add_student(db, await _school(user, db), class_id, payload.student_id)
    return {"success": True, "message": "Ученик добавлен"}


@router.delete("/classes/{class_id}/students/{student_id}")
async def remove_class_student(
    class_id: int,
    student_id: int,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    await cls.remove_student(db, await _school(user, db), class_id, student_id)
    return {"success": True, "message": "Ученик удалён из класса"}


@router.get("/classes/{class_id}/schedule")
async def class_schedule(
    class_id: int, user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)
) -> dict:
    return await cls.get_class_schedule(db, await _school(user, db), class_id)


# ============ Academic years ============
@router.get("/academic-years")
async def get_academic_years(user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)) -> dict:
    return {"academic_years": await acad.list_academic_years(db, await _school(user, db))}


@router.post("/academic-years")
async def create_academic_year(
    payload: AcademicYearCreate, user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)
) -> dict:
    y = await acad.create_academic_year(db, await _school(user, db), payload)
    return {"success": True, "message": "Учебный год создан", "id": y.id}


@router.put("/academic-years/{year_id}")
async def update_academic_year(
    year_id: int,
    payload: AcademicYearUpdate,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    await acad.update_academic_year(db, await _school(user, db), year_id, payload)
    return {"success": True, "message": "Учебный год обновлён"}


@router.delete("/academic-years/{year_id}")
async def delete_academic_year(
    year_id: int, user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)
) -> dict:
    await acad.delete_academic_year(db, await _school(user, db), year_id)
    return {"success": True, "message": "Учебный год удалён"}


# ============ School periods ============
@router.get("/school-periods")
async def get_school_periods(user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)) -> dict:
    return {"periods": await acad.list_school_periods(db, await _school(user, db))}


@router.post("/school-periods")
async def create_school_period(
    payload: SchoolPeriodCreate, user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)
) -> dict:
    p = await acad.create_school_period(db, await _school(user, db), payload)
    return {"success": True, "message": "Период создан", "id": p.id}


@router.put("/school-periods/{period_id}")
async def update_school_period(
    period_id: int,
    payload: SchoolPeriodUpdate,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    await acad.update_school_period(db, await _school(user, db), period_id, payload)
    return {"success": True, "message": "Период обновлён"}


@router.delete("/school-periods/{period_id}")
async def delete_school_period(
    period_id: int, user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)
) -> dict:
    await acad.delete_school_period(db, await _school(user, db), period_id)
    return {"success": True, "message": "Период удалён"}


# ============ Bell schedules ============
@router.get("/bell-schedules")
async def get_bell_schedules(user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)) -> dict:
    return {"success": True, "data": await acad.list_bell_schedules(db, await _school(user, db))}


@router.post("/bell-schedules")
async def create_bell_schedule(
    payload: BellScheduleCreate, user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)
) -> dict:
    bs = await acad.create_bell_schedule(db, await _school(user, db), payload)
    return {"success": True, "message": "Расписание звонков создано", "id": bs.id}


@router.put("/bell-schedules/{schedule_id}")
async def update_bell_schedule(
    schedule_id: int,
    payload: BellScheduleUpdate,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    await acad.update_bell_schedule(db, await _school(user, db), schedule_id, payload)
    return {"success": True, "message": "Расписание звонков обновлено"}


@router.delete("/bell-schedules/{schedule_id}")
async def delete_bell_schedule(
    schedule_id: int, user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)
) -> dict:
    await acad.delete_bell_schedule(db, await _school(user, db), schedule_id)
    return {"success": True, "message": "Расписание звонков удалено"}


# ============ Teachers + assignments ============
@router.get("/teachers")
async def get_teachers(user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)) -> dict:
    return {"teachers": await tch.list_teachers(db, await _school(user, db))}


@router.post("/teacher-subjects")
async def assign_teacher_subject(
    payload: TeacherSubjectAssign, user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)
) -> dict:
    ts = await tch.assign(db, await _school(user, db), payload)
    return {"success": True, "message": "Назначение создано", "id": ts.id}


@router.delete("/teacher-subjects/{assignment_id}")
async def delete_teacher_subject(
    assignment_id: int, user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)
) -> dict:
    await tch.delete_assignment(db, await _school(user, db), assignment_id)
    return {"success": True, "message": "Назначение удалено"}
