"""Homework & control-work management (Phase 6), ported from the legacy
schedule router.

Teachers create/update/delete homework and schedule control works for classes
they are assigned to (admins bypass the assignment check). Everything is scoped
to the resolved school_id. The student diary (app/modules/student) reads these
back, closing the teacher → student loop.

File attachments are written under /app/data, which in v2 is a dedicated app-data
volume mounted on the school stack (school_<slug>_appdata). Файлы переживают
OTA-пересоздание app-контейнера. URL-ссылки-вложения тома не требуют.
"""

from __future__ import annotations

import os
import secrets
import shutil
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Subject, User
from app.models import ParentStudent
from app.core.time import utc_now
from app.models.academic import AcademicYear, Class, ClassStudent, LessonOccurrence, Schedule, SchoolPeriod, TeacherSubject
from app.models.journal import ControlWork, Homework, HomeworkAttachment, HomeworkStateReceipt, HomeworkStudentState
from app.modules.coursework.schemas import ControlWorkCreate, HomeworkCreate, HomeworkStateUpdate, HomeworkUpdate
from app.modules.academic.occurrences import get_or_create_occurrence
from app.modules.journal.service import _assigned, _is_admin

DAY_NAMES_ACC = ["понедельник", "вторник", "среду", "четверг", "пятницу", "субботу"]

# Абсолютный путь под точкой монтирования app-data тома (см. school_provisioner).
UPLOAD_DIR = os.environ.get("APP_DATA_DIR", "/app/data") + "/uploads/homework"
MAX_FILE_SIZE = 13 * 1024 * 1024  # 13 MB
ALLOWED_EXTENSIONS = {
    ".pdf", ".doc", ".docx", ".txt", ".rtf", ".odt",
    ".xls", ".xlsx", ".ppt", ".pptx", ".csv",
    ".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic", ".zip",
}


def _utc_naive(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def _att_dict(a: HomeworkAttachment) -> dict:
    return {"id": a.id, "filename": a.filename, "url_link": a.url_link}


async def _attachments_by_hw(db: AsyncSession, hw_ids: list[int]) -> dict[int, list[dict]]:
    if not hw_ids:
        return {}
    rows = (
        await db.execute(select(HomeworkAttachment).where(HomeworkAttachment.homework_id.in_(hw_ids)))
    ).scalars().all()
    out: dict[int, list[dict]] = {}
    for a in rows:
        out.setdefault(a.homework_id, []).append(_att_dict(a))
    return out


# ---- homework ----
async def _allowed_class_ids(db: AsyncSession, school_id: int, user: User) -> set[int]:
    if user.role in {"school_admin", "director"}:
        stmt = select(Class.id).where(Class.school_id == school_id)
    elif user.role == "teacher":
        stmt = select(Class.id).where(
            Class.school_id == school_id,
            (Class.teacher_id == user.id)
            | Class.id.in_(
                select(TeacherSubject.class_id).where(
                    TeacherSubject.teacher_id == user.id,
                    TeacherSubject.school_id == school_id,
                )
            ),
        )
    elif user.role == "student":
        stmt = (
            select(Class.id)
            .join(ClassStudent, ClassStudent.class_id == Class.id)
            .where(
                Class.school_id == school_id,
                ClassStudent.student_id == user.id,
                user.school_id == school_id,
                user.is_active,
            )
        )
    elif user.role == "parent":
        stmt = (
            select(Class.id)
            .join(ClassStudent, ClassStudent.class_id == Class.id)
            .join(User, User.id == ClassStudent.student_id)
            .join(ParentStudent, ParentStudent.student_id == User.id)
            .where(
                Class.school_id == school_id,
                ParentStudent.parent_id == user.id,
                User.school_id == school_id,
                User.role == "student",
                User.is_active.is_(True),
                user.school_id == school_id,
                user.is_active,
            )
        )
    else:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Нет доступа")
    return set((await db.execute(stmt)).scalars().all())


async def _scoped_class_ids(
    db: AsyncSession, school_id: int, user: User, class_id: int | None
) -> set[int]:
    allowed = await _allowed_class_ids(db, school_id, user)
    return allowed if class_id is None else allowed & {class_id}


async def list_homework(
    db: AsyncSession, school_id: int, user: User, class_id: int | None, subject_id: int | None
) -> dict:
    class_ids = await _scoped_class_ids(db, school_id, user, class_id)
    if not class_ids:
        return {"homework": []}

    stmt = select(Homework).where(
        Homework.school_id == school_id, Homework.class_id.in_(class_ids)
    ).order_by(Homework.created_at.desc())
    if user.role in {"student", "parent"}:
        now = utc_now()
        stmt = stmt.where(or_(
            Homework.published_at <= now,
            (
                Homework.published_at.is_(None)
                & Homework.assigned_occurrence_id.is_(None)
                & Homework.target_occurrence_id.is_(None)
                & Homework.deadline_at.is_(None)
            ),
        ))
    if subject_id is not None:
        stmt = stmt.where(Homework.subject_id == subject_id)
    rows = (await db.execute(stmt)).scalars().all()

    class_ids = {h.class_id for h in rows}
    subj_ids = {h.subject_id for h in rows}
    classes = (
        {c.id: c.name for c in (await db.execute(select(Class).where(Class.id.in_(class_ids)))).scalars().all()}
        if class_ids
        else {}
    )
    subjects = (
        {s.id: s.name for s in (await db.execute(select(Subject).where(Subject.id.in_(subj_ids)))).scalars().all()}
        if subj_ids
        else {}
    )
    atts = await _attachments_by_hw(db, [h.id for h in rows])
    states: dict[int, HomeworkStudentState] = {}
    if user.role == "student" and rows:
        states = {
            state.homework_id: state
            for state in (await db.scalars(select(HomeworkStudentState).where(
                HomeworkStudentState.school_id == school_id,
                HomeworkStudentState.student_id == user.id,
                HomeworkStudentState.homework_id.in_([h.id for h in rows]),
            ))).all()
        }

    return {
        "homework": [
            {
                "id": h.id,
                "class_id": h.class_id,
                "class_name": classes.get(h.class_id),
                "subject_id": h.subject_id,
                "subject_name": subjects.get(h.subject_id),
                "title": h.title,
                "description": h.description,
                "due_date": h.due_date.isoformat() if h.due_date else None,
                "assigned_occurrence_id": h.assigned_occurrence_id,
                "target_occurrence_id": h.target_occurrence_id,
                "published_at": h.published_at.isoformat() if h.published_at else None,
                "deadline_at": h.deadline_at.isoformat() if h.deadline_at else None,
                "is_overdue": bool((h.deadline_at or h.due_date) and (h.deadline_at or h.due_date) < utc_now()),
                "student_state": (
                    {"status": states[h.id].status, "version": states[h.id].version, "completed_at": states[h.id].completed_at.isoformat() if states[h.id].completed_at else None}
                    if h.id in states else ({"status": "not_started", "version": 0, "completed_at": None} if user.role == "student" else None)
                ),
                "created_at": h.created_at.isoformat() if h.created_at else None,
                "attachments": atts.get(h.id, []),
            }
            for h in rows
        ]
    }


async def _validate_due_date(db: AsyncSession, school_id: int, class_id: int, subject_id: int, due_date) -> None:
    if not due_date:
        return
    due_day = due_date.weekday()  # 0=Mon ... 6=Sun
    if due_day > 5:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Нельзя задавать ДЗ на воскресенье")
    days = (
        await db.execute(
            select(Schedule.day_of_week)
            .where(
                Schedule.class_id == class_id,
                Schedule.subject_id == subject_id,
                Schedule.school_id == school_id,
            )
            .distinct()
        )
    ).scalars().all()
    if due_day not in days:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"У этого класса нет урока по данному предмету в {DAY_NAMES_ACC[due_day]}",
        )


async def _homework_occurrence(
    db: AsyncSession, school_id: int, class_id: int, subject_id: int, occurrence_id: int | None,
) -> LessonOccurrence | None:
    if occurrence_id is None:
        return None
    occurrence = await db.scalar(select(LessonOccurrence).where(
        LessonOccurrence.id == occurrence_id,
        LessonOccurrence.school_id == school_id,
        LessonOccurrence.class_id == class_id,
        LessonOccurrence.subject_id == subject_id,
    ))
    if occurrence is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Урок не относится к выбранному классу и предмету")
    return occurrence


async def create_homework(db: AsyncSession, school_id: int, payload: HomeworkCreate, user: User) -> dict:
    cls = (
        await db.execute(select(Class).where(Class.id == payload.class_id, Class.school_id == school_id))
    ).scalar_one_or_none()
    if cls is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Класс не найден")
    subject = await db.scalar(select(Subject).where(Subject.id == payload.subject_id, Subject.school_id == school_id))
    if subject is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Предмет не найден")
    if not await _assigned(db, user, payload.class_id, payload.subject_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Вы не ведёте этот предмет в данном классе")
    await _validate_due_date(db, school_id, payload.class_id, payload.subject_id, payload.due_date)
    assigned_occurrence = await _homework_occurrence(db, school_id, payload.class_id, payload.subject_id, payload.assigned_occurrence_id)
    target_occurrence = await _homework_occurrence(db, school_id, payload.class_id, payload.subject_id, payload.target_occurrence_id)

    hw = Homework(
        school_id=school_id,
        class_id=payload.class_id,
        subject_id=payload.subject_id,
        teacher_id=user.id,
        title=payload.title,
        description=payload.description,
        due_date=payload.due_date,
        occurrence_id=target_occurrence.id if target_occurrence else None,
        assigned_occurrence_id=assigned_occurrence.id if assigned_occurrence else None,
        target_occurrence_id=target_occurrence.id if target_occurrence else None,
        published_at=_utc_naive(payload.published_at),
        deadline_at=_utc_naive(payload.deadline_at),
    )
    db.add(hw)
    await db.commit()
    await db.refresh(hw)
    return {"success": True, "homework_id": hw.id}


async def _get_homework(db: AsyncSession, school_id: int, hw_id: int, user: User) -> Homework:
    hw = (
        await db.execute(select(Homework).where(Homework.id == hw_id, Homework.school_id == school_id))
    ).scalar_one_or_none()
    if hw is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Задание не найдено")
    if not _is_admin(user) and hw.teacher_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Только автор задания или администратор")
    return hw


async def update_homework(db: AsyncSession, school_id: int, hw_id: int, payload: HomeworkUpdate, user: User) -> dict:
    hw = await _get_homework(db, school_id, hw_id, user)
    if payload.due_date is not None:
        await _validate_due_date(db, school_id, hw.class_id, hw.subject_id, payload.due_date)
        hw.due_date = payload.due_date
    if payload.title is not None:
        hw.title = payload.title
    if payload.description is not None:
        hw.description = payload.description
    if "assigned_occurrence_id" in payload.model_fields_set:
        assigned = await _homework_occurrence(db, school_id, hw.class_id, hw.subject_id, payload.assigned_occurrence_id)
        hw.assigned_occurrence_id = assigned.id if assigned else None
    if "target_occurrence_id" in payload.model_fields_set:
        target = await _homework_occurrence(db, school_id, hw.class_id, hw.subject_id, payload.target_occurrence_id)
        hw.target_occurrence_id = target.id if target else None
        hw.occurrence_id = target.id if target else None
    if "published_at" in payload.model_fields_set:
        hw.published_at = _utc_naive(payload.published_at)
    if "deadline_at" in payload.model_fields_set:
        if payload.deadline_at is not None and payload.target_occurrence_id is None and hw.target_occurrence_id is None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "target_occurrence_id is required with deadline_at")
        hw.deadline_at = _utc_naive(payload.deadline_at)
    await db.commit()
    return {"success": True, "message": "Задание обновлено"}


async def update_homework_state(
    db: AsyncSession, school_id: int, homework_id: int, payload: HomeworkStateUpdate, user: User,
) -> dict:
    if user.role != "student" or user.school_id != school_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Доступно только ученику")
    receipt = await db.scalar(select(HomeworkStateReceipt).where(
        HomeworkStateReceipt.student_id == user.id,
        HomeworkStateReceipt.client_action_id == payload.client_action_id,
    ))
    if receipt is not None:
        if receipt.homework_id != homework_id or receipt.expected_version != payload.version or receipt.requested_status != payload.status:
            raise HTTPException(status.HTTP_409_CONFLICT, {"code": "CLIENT_ACTION_CONFLICT"})
        state = await db.scalar(select(HomeworkStudentState).where(
            HomeworkStudentState.homework_id == homework_id,
            HomeworkStudentState.student_id == user.id,
        ))
        return {"homework_id": homework_id, "status": state.status, "version": receipt.resulting_version, "completed_at": state.completed_at.isoformat() if state.completed_at else None, "replayed": True}
    homework = await db.scalar(
        select(Homework)
        .join(ClassStudent, ClassStudent.class_id == Homework.class_id)
        .where(
            Homework.id == homework_id,
            Homework.school_id == school_id,
            ClassStudent.student_id == user.id,
        )
    )
    if homework is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Задание не найдено")
    now = utc_now()
    if payload.version == 0:
        existing = await db.scalar(select(HomeworkStudentState).where(
            HomeworkStudentState.homework_id == homework_id,
            HomeworkStudentState.student_id == user.id,
        ))
        if existing is not None:
            raise HTTPException(status.HTTP_409_CONFLICT, {"code": "VERSION_CONFLICT", "current_version": existing.version})
        state = HomeworkStudentState(
            school_id=school_id,
            homework_id=homework_id,
            student_id=user.id,
            status=payload.status,
            completed_at=now if payload.status == "completed" else None,
        )
        db.add(state)
        await db.commit()
        await db.refresh(state)
    else:
        result = await db.execute(update(HomeworkStudentState).where(
            HomeworkStudentState.school_id == school_id,
            HomeworkStudentState.homework_id == homework_id,
            HomeworkStudentState.student_id == user.id,
            HomeworkStudentState.version == payload.version,
        ).values(
            status=payload.status,
            completed_at=now if payload.status == "completed" else None,
            updated_at=now,
            version=HomeworkStudentState.version + 1,
        ))
        if result.rowcount != 1:
            await db.rollback()
            current = await db.scalar(select(HomeworkStudentState.version).where(
                HomeworkStudentState.homework_id == homework_id,
                HomeworkStudentState.student_id == user.id,
            ))
            raise HTTPException(status.HTTP_409_CONFLICT, {"code": "VERSION_CONFLICT", "current_version": current})
        await db.commit()
        state = await db.scalar(select(HomeworkStudentState).where(
            HomeworkStudentState.homework_id == homework_id,
            HomeworkStudentState.student_id == user.id,
        ))
    db.add(HomeworkStateReceipt(
        school_id=school_id,
        homework_id=homework_id,
        student_id=user.id,
        client_action_id=payload.client_action_id,
        expected_version=payload.version,
        requested_status=payload.status,
        resulting_version=state.version,
    ))
    await db.commit()
    return {"homework_id": homework_id, "status": state.status, "version": state.version, "completed_at": state.completed_at.isoformat() if state.completed_at else None, "replayed": False}


async def delete_homework(db: AsyncSession, school_id: int, hw_id: int, user: User) -> dict:
    hw = await _get_homework(db, school_id, hw_id, user)
    await db.delete(hw)
    await db.commit()
    return {"success": True, "message": "Задание удалено"}


# ---- attachments ----
def _ext_ok(filename: str | None) -> str:
    ext = os.path.splitext(filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Недопустимый тип файла. Разрешены изображения и документы (PDF, DOCX, TXT и др.)",
        )
    return ext


async def add_attachment(
    db: AsyncSession, school_id: int, hw_id: int, user: User, file: UploadFile | None, url_link: str | None
) -> dict:
    hw = await _get_homework(db, school_id, hw_id, user)
    if not file and not url_link:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Нужно передать file или url_link")

    att = HomeworkAttachment(
        homework_id=hw.id,
        expires_at=(hw.due_date or datetime.now()) + timedelta(days=2),
    )
    if url_link:
        att.url_link = url_link
    if file:
        ext = _ext_ok(file.filename)
        contents = await file.read()
        if len(contents) > MAX_FILE_SIZE:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Размер файла не должен превышать 13 МБ")
        os.makedirs(UPLOAD_DIR, exist_ok=True)
        safe_name = secrets.token_hex(8) + ext
        path = os.path.join(UPLOAD_DIR, safe_name)
        with open(path, "wb") as buf:
            buf.write(contents)
        att.filename = file.filename
        att.file_path = path

    db.add(att)
    await db.commit()
    await db.refresh(att)
    return {"success": True, "attachment": _att_dict(att)}


async def delete_attachment(db: AsyncSession, school_id: int, att_id: int, user: User) -> dict:
    row = (
        await db.execute(
            select(HomeworkAttachment, Homework)
            .join(Homework, Homework.id == HomeworkAttachment.homework_id)
            .where(HomeworkAttachment.id == att_id, Homework.school_id == school_id)
        )
    ).first()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Вложение не найдено")
    att, hw = row
    if not _is_admin(user) and hw.teacher_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Только автор задания или администратор")
    if att.file_path and os.path.exists(att.file_path):
        try:
            os.remove(att.file_path)
        except OSError:
            pass
    await db.delete(att)
    await db.commit()
    return {"success": True, "message": "Вложение удалено"}


async def get_attachment_file(
    db: AsyncSession, school_id: int, att_id: int, user: User
) -> HomeworkAttachment:
    class_ids = await _allowed_class_ids(db, school_id, user)
    row = (
        await db.execute(
            select(HomeworkAttachment)
            .join(Homework, Homework.id == HomeworkAttachment.homework_id)
            .where(
                HomeworkAttachment.id == att_id,
                Homework.school_id == school_id,
                Homework.class_id.in_(class_ids),
            )
        )
    ).scalar_one_or_none()
    if row is None or not row.file_path or not os.path.exists(row.file_path):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Файл не найден")
    return row


# ---- control works ----
async def list_control_works(
    db: AsyncSession, school_id: int, user: User, class_id: int | None, subject_id: int | None
) -> dict:
    class_ids = await _scoped_class_ids(db, school_id, user, class_id)
    if not class_ids:
        return {"control_works": []}

    stmt = select(ControlWork).where(
        ControlWork.school_id == school_id, ControlWork.class_id.in_(class_ids)
    ).order_by(ControlWork.work_date.desc())
    if subject_id is not None:
        stmt = stmt.where(ControlWork.subject_id == subject_id)
    rows = (await db.execute(stmt)).scalars().all()

    subj_ids = {w.subject_id for w in rows}
    subjects = (
        {s.id: s.name for s in (await db.execute(select(Subject).where(Subject.id.in_(subj_ids)))).scalars().all()}
        if subj_ids
        else {}
    )
    return {
        "control_works": [
            {
                "id": w.id,
                "class_id": w.class_id,
                "subject_id": w.subject_id,
                "subject_name": subjects.get(w.subject_id),
                "work_type": w.work_type,
                "title": w.title,
                "work_date": w.work_date.isoformat() if w.work_date else None,
            }
            for w in rows
        ]
    }


async def create_control_work(db: AsyncSession, school_id: int, payload: ControlWorkCreate, user: User) -> dict:
    cls = (
        await db.execute(select(Class).where(Class.id == payload.class_id, Class.school_id == school_id))
    ).scalar_one_or_none()
    if cls is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Класс не найден")
    if not await _assigned(db, user, payload.class_id, payload.subject_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Нет доступа")

    work_day = payload.work_date.date()
    day_start = datetime(work_day.year, work_day.month, work_day.day)
    day_end = day_start + timedelta(days=1)

    if payload.work_type == "контрольная":
        clash = await db.scalar(
            select(func.count())
            .select_from(ControlWork)
            .where(
                ControlWork.class_id == payload.class_id,
                ControlWork.work_type == "контрольная",
                ControlWork.work_date >= day_start,
                ControlWork.work_date < day_end,
            )
        )
        if clash:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "В этом классе уже запланирована контрольная работа на этот день",
            )

    year_ids = (
        await db.execute(select(AcademicYear.id).where(AcademicYear.school_id == school_id))
    ).scalars().all()
    if year_ids:
        holiday = await db.scalar(
            select(func.count())
            .select_from(SchoolPeriod)
            .where(
                SchoolPeriod.academic_year_id.in_(year_ids),
                SchoolPeriod.period_type.in_(["holiday", "vacation"]),
                SchoolPeriod.start_date <= payload.work_date,
                SchoolPeriod.end_date >= payload.work_date,
            )
        )
        if holiday:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Нельзя планировать работу на каникулярный день")

    occurrence = None
    if payload.lesson_number is not None:
        occurrence = await get_or_create_occurrence(
            db, school_id, payload.class_id, payload.subject_id,
            work_day, payload.lesson_number,
        )

    cw = ControlWork(
        school_id=school_id,
        class_id=payload.class_id,
        subject_id=payload.subject_id,
        teacher_id=user.id,
        work_type=payload.work_type,
        title=payload.title or payload.work_type.capitalize(),
        work_date=payload.work_date,
        occurrence_id=occurrence.id if occurrence else None,
    )
    db.add(cw)
    await db.commit()
    await db.refresh(cw)
    return {"success": True, "message": "Работа запланирована", "id": cw.id}


async def delete_control_work(db: AsyncSession, school_id: int, work_id: int, user: User) -> dict:
    cw = (
        await db.execute(select(ControlWork).where(ControlWork.id == work_id, ControlWork.school_id == school_id))
    ).scalar_one_or_none()
    if cw is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Работа не найдена")
    if not _is_admin(user) and cw.teacher_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Только автор работы или администратор")
    await db.delete(cw)
    await db.commit()
    return {"success": True, "message": "Работа удалена"}
