"""PDF grade-import orchestration (Phase 6), ported from the legacy
JournalImporterService and adapted to the tenant schema.

Two steps:
  • validate_preview — strict checks (subject matches the journal; dates fall on
    a weekday the class actually has that subject).
  • execute_import — fuzzy-match student names to class members, map acronyms to
    work types via the operator's mapping, then REPLACE prior PDF-imported grades
    in the file's date range (manual grades are left untouched) and insert.

Imported grades carry value=0 (no livki — historical import shouldn't pay out)
and comment=PDF_IMPORT_MARKER so replace-mode can find exactly its own rows.
"""

from __future__ import annotations

import re
from datetime import datetime
from difflib import SequenceMatcher

from fastapi import HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Class, ClassStudent, Subject, User
from app.models.academic import Schedule
from app.models.journal import Grade
from app.services.parsers.base import NormalizationEngine
from app.services.parsers.dtos import (
    ImportExecutionRequest,
    ImportExecutionResponse,
    ImportLog,
    ParsingPreviewResponse,
)

PDF_IMPORT_MARKER = "[PDF Автоимпорт]"


def _parse_date(date_str: str) -> datetime | None:
    now = datetime.now()
    normalized = re.sub(r"[\-/]", ".", date_str)
    parts = normalized.split(".")
    if len(parts) < 2:
        return None
    try:
        day, month = int(parts[0]), int(parts[1])
        if len(parts) >= 3:
            raw_year = int(parts[2])
            year = raw_year + 2000 if raw_year < 100 else raw_year
        else:
            year = now.year
            if (datetime(year, month, day) - now).days > 180:
                year -= 1
        return datetime(year, month, day)
    except (ValueError, OverflowError):
        return None


async def _class_in_school(db: AsyncSession, school_id: int, class_id: int) -> Class:
    cls = (
        await db.execute(select(Class).where(Class.id == class_id, Class.school_id == school_id))
    ).scalar_one_or_none()
    if cls is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Класс не найден")
    return cls


async def validate_preview(
    db: AsyncSession, school_id: int, preview: ParsingPreviewResponse, class_id: int, subject_id: int
) -> ParsingPreviewResponse:
    cls = await _class_in_school(db, school_id, class_id)
    subject = (
        await db.execute(select(Subject).where(Subject.id == subject_id, Subject.school_id == school_id))
    ).scalar_one_or_none()
    if subject is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Предмет не найден")

    # 1. Subject must match the journal we are importing into.
    if preview.subject_raw_name and not NormalizationEngine.subject_matches(
        preview.subject_raw_name, subject.name
    ):
        err = (
            f"Не тот предмет! В файле указан «{preview.subject_raw_name}», "
            f"а журнал открыт по «{subject.name}». Загрузите правильный файл."
        )
        preview.validation_errors.append(err)
        raise HTTPException(status.HTTP_400_BAD_REQUEST, err)

    # 2. Every date must land on a weekday the class has that subject (if scheduled).
    days = (
        await db.execute(
            select(Schedule.day_of_week).where(
                Schedule.class_id == class_id, Schedule.subject_id == subject_id
            )
        )
    ).scalars().all()
    if days:
        valid = set(days)
        absent = [d for d in preview.unique_dates if (p := _parse_date(d)) and p.weekday() not in valid]
        if absent:
            err = f"Этих дат нет в расписании предмета: {', '.join(absent)}"
            preview.validation_errors.append(err)
            raise HTTPException(status.HTTP_400_BAD_REQUEST, err)

    return preview


async def execute_import(
    db: AsyncSession,
    school_id: int,
    preview: ParsingPreviewResponse,
    request: ImportExecutionRequest,
    class_id: int,
    subject_id: int,
    teacher_id: int,
) -> ImportExecutionResponse:
    cls = await _class_in_school(db, school_id, class_id)
    logs: list[ImportLog] = []
    added = replaced = 0

    # Build a name → student_id map for fuzzy matching.
    students = (
        await db.execute(
            select(User).join(ClassStudent, ClassStudent.student_id == User.id).where(ClassStudent.class_id == class_id)
        )
    ).scalars().all()
    student_map: dict[str, int] = {}
    for s in students:
        full = f"{s.last_name or ''} {s.first_name or ''}".strip()
        student_map[NormalizationEngine.normalize_student_name(full)] = s.id
        last_only = NormalizationEngine.normalize_student_name(s.last_name or "")
        if last_only and len(last_only) > 3 and last_only not in student_map:
            student_map[last_only] = s.id

    def _norm_empty(v):
        if v is None:
            return None
        if isinstance(v, str) and not v.strip():
            return None
        return v

    prepared: list[dict] = []
    all_dates: list[datetime] = []
    for rg in preview.preview_grades:
        dt = _parse_date(rg.date)
        if not dt:
            continue

        target = NormalizationEngine.normalize_student_name(rg.student_name)
        student_id = student_map.get(target)
        if student_id is None:
            best_score, best_id = 0.0, None
            for db_norm, db_id in student_map.items():
                if NormalizationEngine.fuzzy_match(target, db_norm, threshold=0.82):
                    score = SequenceMatcher(None, target, db_norm).ratio()
                    if score > best_score:
                        best_score, best_id = score, db_id
            student_id = best_id
        if not student_id:
            logs.append(ImportLog(
                student_name=rg.student_name, date=rg.date,
                message=f"Ученик пропущен (не найден в классе): {rg.student_name}", level="warning",
            ))
            continue

        work_type_id = request.mapping.get(NormalizationEngine.normalize_text(rg.acronym)) or request.mapping.get(rg.acronym)
        if not work_type_id:
            logs.append(ImportLog(
                student_name=rg.student_name, date=rg.date,
                message=f"Пропущено: не найден тип работы для «{rg.acronym}»", level="error",
            ))
            continue

        prepared.append({
            "student_id": student_id,
            "work_type_id": work_type_id,
            "grade_value": _norm_empty(rg.grade_value),
            "attendance_mark": _norm_empty(rg.attendance_mark),
            "lesson_date": dt,
        })
        all_dates.append(dt)

    if all_dates:
        min_d = min(all_dates).replace(hour=0, minute=0, second=0, microsecond=0)
        max_d = max(all_dates).replace(hour=23, minute=59, second=59, microsecond=999999)
        res = await db.execute(
            delete(Grade).where(
                Grade.class_id == class_id,
                Grade.subject_id == subject_id,
                Grade.comment == PDF_IMPORT_MARKER,
                Grade.lesson_date >= min_d,
                Grade.lesson_date <= max_d,
            )
        )
        replaced = res.rowcount or 0
        if replaced:
            logs.append(ImportLog(
                student_name="", date=f"{min_d.strftime('%d.%m')} – {max_d.strftime('%d.%m')}",
                message=f"Replace-mode: удалено {replaced} ранее импортированных оценок в диапазоне. Ручные оценки сохранены.",
                level="info",
            ))
    else:
        logs.append(ImportLog(
            student_name="", date="", message="В файле не найдено валидных оценок — журнал не изменён.", level="warning",
        ))

    for p in prepared:
        db.add(Grade(
            school_id=school_id,
            student_id=p["student_id"],
            teacher_id=teacher_id,
            class_id=class_id,
            subject_id=subject_id,
            work_type_id=p["work_type_id"],
            grade_value=p["grade_value"],
            value=0,  # imported grades award no livki
            attendance_mark=p["attendance_mark"],
            lesson_date=p["lesson_date"],
            comment=PDF_IMPORT_MARKER,
        ))
        added += 1

    return ImportExecutionResponse(added_count=added, skipped_count=0, replaced_count=replaced, logs=logs)
