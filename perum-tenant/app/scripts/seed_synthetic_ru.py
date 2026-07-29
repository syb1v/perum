from __future__ import annotations

import argparse
import asyncio
import json
import os
import random
import secrets
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from typing import Any

from sqlalchemy import and_, delete, func, insert, or_, select, update
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncSession

from app.core.db import Base, SessionLocal
from app.core.security import hash_password
from app.services.points_calculator import calculate_points
from app.models import (
    AcademicYear,
    BellSchedule,
    BellScheduleItem,
    Class,
    ClassStudent,
    ControlWork,
    ExchangeLog,
    ExchangeSettings,
    FinalGrade,
    Grade,
    Homework,
    HomeworkStudentState,
    Investment,
    LessonGroup,
    LessonGroupStudent,
    LessonOccurrence,
    LessonTemplate,
    News,
    Notification,
    PageVisit,
    ParentStudent,
    Quest,
    Schedule,
    School,
    SchoolPeriod,
    ShopItem,
    Subject,
    SubjectAverage,
    SyntheticSeedRow,
    TeacherSubject,
    TenantMeta,
    Topic,
    TradingWindow,
    Transaction,
    User,
    UserInventory,
    UserQuest,
    WorkType,
)

NAMESPACE = "synru"
PASSWORD_ENV = "SYNRU_ACCOUNT_PASSWORD"
SCHOOL_ENV = "SYNRU_SCHOOL_ID"
RANDOM_SEED = 20260729
CHUNK_SIZE = 2000
PREDICATE_CHUNK_SIZE = 1000
_SQLITE_LOCKS: dict[int, asyncio.Lock] = defaultdict(asyncio.Lock)
WORK_TYPE_SPECS = [("Ответ на уроке", 1.0), ("Домашняя работа", 1.0), ("Самостоятельная работа", 1.5), ("Контрольная работа", 2.0), ("Проект", 2.0)]

SUBJECT_NAMES = [
    "Математика", "Русский язык", "Литература", "Физика", "Химия", "Биология",
    "История", "Обществознание", "География", "Информатика", "Английский язык",
    "Физическая культура", "Окружающий мир", "Музыка", "Изобразительное искусство",
    "Технология", "Основы безопасности", "Астрономия",
]
FIRST_NAMES = [
    "Александр", "Алексей", "Андрей", "Анна", "Артём", "Валерия", "Вера", "Виктория",
    "Дарья", "Денис", "Дмитрий", "Егор", "Екатерина", "Елена", "Иван", "Ирина",
    "Кирилл", "Ксения", "Максим", "Мария", "Михаил", "Надежда", "Никита", "Олег",
    "Полина", "Роман", "Светлана", "София", "Степан", "Тимофей",
]
LAST_NAMES = [
    "Александров", "Беляев", "Васильев", "Волков", "Воробьёв", "Гаврилов", "Громов",
    "Данилов", "Егоров", "Жуков", "Зайцев", "Ильин", "Ковалёв", "Козлов", "Комаров",
    "Крылов", "Кузнецов", "Лебедев", "Макаров", "Мельников", "Морозов", "Никитин",
    "Новиков", "Орлов", "Павлов", "Петров", "Романов", "Семёнов", "Соколов", "Фёдоров",
]
PATRONYMICS = ["Александрович", "Алексеевич", "Андреевич", "Викторович", "Дмитриевич", "Иванович", "Михайлович", "Олегович"]


@dataclass(frozen=True)
class Scale:
    classes: int
    students_per_class: int
    teachers: int
    parents: int
    subjects: int
    history_weeks: int
    grades_per_student_subject: int
    attendance_per_student: int


SCALES = {
    "small": Scale(11, 18, 28, 145, 16, 10, 6, 4),
    "medium": Scale(24, 26, 60, 450, 18, 24, 12, 8),
    "large": Scale(34, 29, 82, 710, 18, 32, 14, 10),
}


def _class_grades(count: int) -> list[int]:
    base = list(range(1, 12))
    return [base[i % 11] for i in range(count)]


def build_plan(scale_name: str, reference_date: date | None = None) -> dict[str, int | str]:
    scale = SCALES[scale_name]
    reference_date = reference_date or default_reference_date()
    students = scale.classes * scale.students_per_class
    subjects_per_student = 12
    schedules = scale.classes * 30
    occurrences = schedules * scale.history_weeks
    homework = scale.classes * 12 * max(3, scale.history_weeks // 3)
    return {
        "scale": scale_name,
        "random_seed": RANDOM_SEED,
        "reference_date": reference_date.isoformat(),
        "classes": scale.classes,
        "students": students,
        "teachers": scale.teachers,
        "parents": scale.parents,
        "admins": 0,
        "users": students + scale.teachers + scale.parents,
        "subjects_total": scale.subjects,
        "teacher_subject_assignments": scale.classes * 12,
        "weekly_schedule_slots": schedules,
        "lesson_occurrences": occurrences,
        "lesson_groups": scale.classes * 2,
        "topics": scale.subjects * 8,
        "lesson_templates": scale.classes * 12 * max(4, scale.history_weeks // 2),
        "grades_numeric": students * subjects_per_student * scale.grades_per_student_subject,
        "attendance_marks": students * scale.attendance_per_student,
        "grades_total": students * subjects_per_student * scale.grades_per_student_subject + students * scale.attendance_per_student,
        "final_grades": students * subjects_per_student,
        "homework": homework,
        "homework_states": homework * scale.students_per_class,
        "control_works": scale.classes * 24,
        "page_visits": students * 12,
        "news": 8,
        "news_reads": 0,
        "news_likes": 0,
        "shop_items": 10,
        "quests": 6,
        "subject_average_points": scale.classes * 8 * min(16, scale.history_weeks),
        "investments": students * 2,
    }


def _marker_key(school_id: int) -> str:
    return f"{NAMESPACE}:{school_id}"


def _chunks(rows: list[dict[str, Any]]):
    for index in range(0, len(rows), CHUNK_SIZE):
        yield rows[index:index + CHUNK_SIZE]


async def _owned_insert(db: AsyncSession, school_id: int, model, rows: list[dict[str, Any]]) -> list[int]:
    ids: list[int] = []
    for chunk in _chunks(rows):
        statement = insert(model).returning(model.id, sort_by_parameter_order=True)
        chunk_ids = list((await db.scalars(statement, chunk)).all())
        ids.extend(chunk_ids)
        await db.execute(insert(SyntheticSeedRow), [
            {"namespace": NAMESPACE, "school_id": school_id, "table_name": model.__tablename__, "row_id": row_id}
            for row_id in chunk_ids
        ])
        await db.commit()
    return ids


DELETE_MODELS = [
    UserInventory, UserQuest, ExchangeLog, Investment, SubjectAverage,
    TradingWindow, ExchangeSettings, Notification, PageVisit, Transaction, HomeworkStudentState, FinalGrade,
    Grade, ControlWork, Homework, LessonTemplate, LessonGroupStudent, LessonGroup,
    LessonOccurrence, Schedule, TeacherSubject, ClassStudent, ParentStudent, News, Quest,
    ShopItem, Topic, SchoolPeriod, AcademicYear, Class, BellScheduleItem, BellSchedule,
    User, WorkType, Subject,
]


async def rebuild_owned(db: AsyncSession, school_id: int, commit: bool = True) -> dict[str, int]:
    owned = (await db.execute(select(SyntheticSeedRow).where(
        SyntheticSeedRow.namespace == NAMESPACE, SyntheticSeedRow.school_id == school_id
    ))).scalars().all()
    by_table: dict[str, list[int]] = {}
    for row in owned:
        by_table.setdefault(row.table_name, []).append(row.row_id)
    external = await external_reference_counts(db, school_id, set(by_table))
    if external:
        details = ", ".join(f"{table}={count}" for table, count in sorted(external.items()))
        raise RuntimeError(f"rebuild refused: unowned rows reference synthetic data: {details}")
    deleted: dict[str, int] = {}
    for model in DELETE_MODELS:
        ids = by_table.get(model.__tablename__, [])
        if ids:
            deleted[model.__tablename__] = 0
            for chunk in _chunks([{"id": row_id} for row_id in ids]):
                result = await db.execute(delete(model).where(model.id.in_([row["id"] for row in chunk])))
                deleted[model.__tablename__] += result.rowcount or 0
    ownership_ids = [row.id for row in owned]
    for index in range(0, len(ownership_ids), CHUNK_SIZE):
        await db.execute(delete(SyntheticSeedRow).where(SyntheticSeedRow.id.in_(ownership_ids[index:index + CHUNK_SIZE])))
    await db.execute(delete(TenantMeta).where(TenantMeta.key == _marker_key(school_id)))
    if commit:
        await db.commit()
    return deleted


async def external_reference_counts(db: AsyncSession, school_id: int, ownership_tables: set[str]) -> dict[str, int]:
    result: dict[str, int] = {}
    for table in Base.metadata.sorted_tables:
        if table.name in {SyntheticSeedRow.__tablename__, TenantMeta.__tablename__}:
            continue
        conditions = []
        for foreign_key in table.foreign_keys:
            referenced_table = foreign_key.column.table.name
            if referenced_table in ownership_tables:
                conditions.append(select(SyntheticSeedRow.id).where(
                    SyntheticSeedRow.namespace == NAMESPACE,
                    SyntheticSeedRow.school_id == school_id,
                    SyntheticSeedRow.table_name == referenced_table,
                    SyntheticSeedRow.row_id == foreign_key.parent,
                ).exists())
        if not conditions:
            continue
        external_condition = or_(*conditions)
        if table.name in ownership_tables and "id" in table.c:
            owned_row = select(SyntheticSeedRow.id).where(
                SyntheticSeedRow.namespace == NAMESPACE,
                SyntheticSeedRow.school_id == school_id,
                SyntheticSeedRow.table_name == table.name,
                SyntheticSeedRow.row_id == table.c.id,
            ).exists()
            external_condition = and_(external_condition, ~owned_row)
        count = await db.scalar(select(func.count()).select_from(table).where(external_condition))
        if count:
            result[table.name] = count
    return result

async def _acquire_lock(db: AsyncSession, school_id: int) -> tuple[AsyncConnection | None, asyncio.Lock | None]:
    if db.bind is not None and db.bind.dialect.name == "postgresql":
        connection = await db.bind.connect()
        locked = await connection.scalar(select(func.pg_try_advisory_lock(0x53594E52, school_id)))
        if not locked:
            await connection.close()
            raise RuntimeError(f"synthetic seed is already running for school {school_id}")
        return connection, None
    lock = _SQLITE_LOCKS[school_id]
    if lock.locked():
        raise RuntimeError(f"synthetic seed is already running for school {school_id}")
    await lock.acquire()
    return None, lock


async def _release_lock(connection: AsyncConnection | None, lock: asyncio.Lock | None, school_id: int) -> None:
    if connection is not None:
        try:
            await connection.scalar(select(func.pg_advisory_unlock(0x53594E52, school_id)))
        finally:
            await connection.close()
    if lock is not None and lock.locked():
        lock.release()


def default_reference_date(today: date | None = None) -> date:
    today = today or date.today()
    year = today.year if today.month >= 9 else today.year - 1
    academic_end = date(year + 1, 5, 24)
    target = min(today - timedelta(days=1), academic_end)
    while target.weekday() != 4:
        target -= timedelta(days=1)
    return target


async def preflight_school(db: AsyncSession, school_id: int, reference_date: date, activity_date: date) -> None:
    for model, label in ((ExchangeSettings, "exchange settings"),):
        count = await db.scalar(select(func.count()).select_from(model).where(model.school_id == school_id))
        if count > 1:
            raise RuntimeError(f"preflight refused: ambiguous {label}: {count} rows")
    current_years = (await db.scalars(select(AcademicYear).where(
        AcademicYear.school_id == school_id, AcademicYear.is_current.is_(True)
    ))).all()
    if len(current_years) > 1:
        raise RuntimeError(f"preflight refused: multiple current academic years: {len(current_years)}")
    if current_years and not (current_years[0].start_date.date() <= reference_date <= current_years[0].end_date.date()):
        raise RuntimeError("preflight refused: current academic year does not cover reference date")
    all_years = (await db.scalars(select(AcademicYear).where(AcademicYear.school_id == school_id))).all()
    if all_years and not current_years:
        raise RuntimeError("preflight refused: academic years exist but none is current")
    if current_years:
        periods = (await db.scalars(select(SchoolPeriod).where(
            SchoolPeriod.academic_year_id == current_years[0].id
        ).order_by(SchoolPeriod.start_date))).all()
        if periods and (len(periods) != 4 or any(left.end_date >= right.start_date for left, right in zip(periods, periods[1:]))):
            raise RuntimeError("preflight refused: existing academic periods are incomplete or overlapping")
        expected_active = sum(period.start_date.date() <= activity_date <= period.end_date.date() for period in periods)
        if sum(bool(period.is_active) for period in periods) != expected_active:
            raise RuntimeError("preflight refused: existing active period configuration is inconsistent")
    class_count = await db.scalar(select(func.count()).select_from(Class).where(Class.school_id == school_id))
    if class_count:
        raise RuntimeError(f"preflight refused: school academic data is non-empty: classes={class_count}")


def _person(index: int, role: str) -> tuple[str, str, str]:
    first = FIRST_NAMES[(index * 7 + len(role)) % len(FIRST_NAMES)]
    last = LAST_NAMES[(index * 11 + len(role) * 3) % len(LAST_NAMES)]
    if first in {"Анна", "Валерия", "Вера", "Виктория", "Дарья", "Екатерина", "Елена", "Ирина", "Ксения", "Мария", "Надежда", "Полина", "Светлана", "София"}:
        last += "а"
        patronymic = ["Александровна", "Алексеевна", "Андреевна", "Викторовна", "Дмитриевна", "Ивановна", "Михайловна", "Олеговна"][index % 8]
    else:
        patronymic = PATRONYMICS[index % len(PATRONYMICS)]
    return first, last, patronymic


def _user_rows(school_id: int, scale: Scale, unknown_hash: str, persona_hash: str | None, activity_date: date) -> tuple[list[dict[str, Any]], list[str], dict[str, str]]:
    roles = ["teacher"] * scale.teachers
    roles += ["student"] * (scale.classes * scale.students_per_class) + ["parent"] * scale.parents
    rows = []
    persona_logins: dict[str, str] = {}
    seen_personas: set[str] = set()
    for index, role in enumerate(roles):
        first, last, patronymic = _person(index, role)
        login = f"synru{school_id}_{role}_{index + 1:04d}"
        is_persona = role not in seen_personas
        if is_persona:
            seen_personas.add(role)
            persona_logins[role] = login
        rows.append({
            "school_id": school_id, "role": role, "login": login,
            "email": f"{login}@example.invalid", "first_name": first, "last_name": last,
            "patronymic": patronymic, "password_hash": persona_hash if is_persona and persona_hash else unknown_hash, "is_active": False,
            "must_change_password": True, "balance": 0,
            "created_at": datetime.combine(activity_date - timedelta(days=(index * 13) % 240), time(9, 0)),
            "last_login_at": datetime.combine(activity_date - timedelta(days=index % 21), time(8 + index % 10, 15)),
        })
    return rows, roles, persona_logins


def _eligible_subject_indexes(grade_level: int) -> list[int]:
    if grade_level <= 4:
        return [0, 1, 2, 5, 7, 8, 9, 10, 11, 12, 13, 14]
    if grade_level <= 6:
        return [0, 1, 2, 5, 6, 8, 9, 10, 11, 13, 14, 15]
    return [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]


async def _seed_synthetic_impl(db: AsyncSession, school_id: int, scale_name: str, persona_hash: str | None, rebuild: bool, reference_date: date, activity_date: date, run_token: str) -> dict[str, Any]:
    school = await db.get(School, school_id)
    if school is None:
        raise ValueError(f"school {school_id} does not exist")
    marker = await db.get(TenantMeta, _marker_key(school_id))
    ownership_count = await db.scalar(select(func.count()).select_from(SyntheticSeedRow).where(
        SyntheticSeedRow.namespace == NAMESPACE, SyntheticSeedRow.school_id == school_id
    ))
    if ownership_count and marker is None and not rebuild:
        raise RuntimeError("synthetic ownership rows exist without marker; use --rebuild")
    if marker is not None and not rebuild:
        raise RuntimeError(f"synthetic marker {_marker_key(school_id)} already exists; use --rebuild")
    deleted = await rebuild_owned(db, school_id, commit=False) if marker is not None or ownership_count else {}
    await preflight_school(db, school_id, reference_date, activity_date)
    subject_rows_existing = (await db.scalars(select(Subject).where(
        Subject.school_id == school_id, Subject.name.in_(SUBJECT_NAMES[:SCALES[scale_name].subjects])
    ))).all()
    if len({row.name for row in subject_rows_existing}) != len(subject_rows_existing):
        raise RuntimeError("preflight refused: duplicate subject names")
    work_rows_existing = (await db.scalars(select(WorkType).where(WorkType.school_id == school_id))).all()
    if len({row.name for row in work_rows_existing}) != len(work_rows_existing):
        raise RuntimeError("preflight refused: duplicate work type names")
    inactive_required = sorted(row.name for row in work_rows_existing if row.name in {name for name, _ in WORK_TYPE_SPECS} and not row.is_active)
    if inactive_required:
        raise RuntimeError(f"preflight refused: required work types are inactive: {', '.join(inactive_required)}")
    db.add(TenantMeta(
        key=_marker_key(school_id),
        value=json.dumps({"status": "building", "scale": scale_name, "seed": RANDOM_SEED, "run_token": run_token}, separators=(",", ":")),
    ))
    await db.commit()
    scale = SCALES[scale_name]
    rng = random.Random(RANDOM_SEED)
    created: dict[str, int] = {}

    existing_subjects = {row.name: row.id for row in subject_rows_existing}
    missing = [name for name in SUBJECT_NAMES[:scale.subjects] if name not in existing_subjects]
    subject_rows = [{
        "school_id": school_id, "name": name, "short_name": name[:18],
        "category": "profile" if name in {"Математика", "Физика", "Информатика"} else "normal",
        "in_exchange": name in SUBJECT_NAMES[:8], "exchange_coefficient": 1.0,
        "profile_weight": 1.2 if name in {"Математика", "Физика", "Информатика"} else 1.0,
        "is_profile_track": name in {"Математика", "Физика", "Информатика"},
    } for name in missing]
    new_subject_ids = await _owned_insert(db, school_id, Subject, subject_rows)
    existing_subjects.update(dict(zip(missing, new_subject_ids)))
    subject_ids = [existing_subjects[name] for name in SUBJECT_NAMES[:scale.subjects]]
    all_subject_rows = (await db.scalars(select(Subject).where(Subject.id.in_(subject_ids)))).all()
    subject_semantics = {row.id: row for row in all_subject_rows}
    created["subjects_created"] = len(new_subject_ids)
    created["subjects_reused"] = scale.subjects - len(new_subject_ids)

    existing_work_types = {row.name: row.id for row in work_rows_existing}
    missing_work = [spec for spec in WORK_TYPE_SPECS if spec[0] not in existing_work_types]
    work_ids_new = await _owned_insert(db, school_id, WorkType, [
        {"school_id": school_id, "name": name, "weight": weight, "is_active": True} for name, weight in missing_work
    ])
    existing_work_types.update({name: row_id for (name, _), row_id in zip(missing_work, work_ids_new)})
    work_ids = [existing_work_types[name] for name, _ in WORK_TYPE_SPECS]
    work_type_rows = {row.id: row for row in (await db.scalars(select(WorkType).where(WorkType.id.in_(work_ids)))).all()}
    created["work_types_created"] = len(work_ids_new)
    created["work_types_reused"] = len(WORK_TYPE_SPECS) - len(work_ids_new)

    unknown_hash = hash_password(secrets.token_urlsafe(48))
    user_rows, roles, persona_logins = _user_rows(school_id, scale, unknown_hash, persona_hash, activity_date)
    user_ids = await _owned_insert(db, school_id, User, user_rows)
    teacher_ids = [uid for uid, role in zip(user_ids, roles) if role == "teacher"]
    student_ids = [uid for uid, role in zip(user_ids, roles) if role == "student"]
    parent_ids = [uid for uid, role in zip(user_ids, roles) if role == "parent"]
    created.update({"users": len(user_ids), "admins": 0, "teachers": len(teacher_ids), "students": len(student_ids), "parents": len(parent_ids)})

    bell_ids = await _owned_insert(db, school_id, BellSchedule, [
        {"school_id": school_id, "name": "Первая смена"}, {"school_id": school_id, "name": "Вторая смена"}
    ])
    bell_item_rows = []
    for bell_index, bell_id in enumerate(bell_ids):
        base_minutes = 8 * 60 + 15 + bell_index * 6 * 60
        for number in range(1, 9):
            start = base_minutes + (number - 1) * 50
            bell_item_rows.append({"bell_schedule_id": bell_id, "lesson_number": number, "start_time": f"{start // 60:02d}:{start % 60:02d}", "end_time": f"{(start + 40) // 60:02d}:{(start + 40) % 60:02d}", "is_saturday": False})
    await _owned_insert(db, school_id, BellScheduleItem, bell_item_rows)
    created.update({"bell_schedules": len(bell_ids), "bell_schedule_items": len(bell_item_rows)})

    grades = _class_grades(scale.classes)
    letters = ["А", "Б", "В", "Г"]
    class_rows = []
    grade_seen: dict[int, int] = {}
    for index, grade_level in enumerate(grades):
        parallel = grade_seen.get(grade_level, 0)
        grade_seen[grade_level] = parallel + 1
        class_rows.append({
            "school_id": school_id, "name": f"{grade_level}{letters[parallel]}", "grade_level": grade_level,
            "is_profile": int(grade_level >= 10 and parallel == 0), "teacher_id": teacher_ids[index % len(teacher_ids)],
            "bell_schedule_id": bell_ids[0 if grade_level <= 8 else 1],
        })
    class_ids = await _owned_insert(db, school_id, Class, class_rows)
    memberships = []
    students_by_class: dict[int, list[int]] = {}
    for index, class_id in enumerate(class_ids):
        members = student_ids[index * scale.students_per_class:(index + 1) * scale.students_per_class]
        students_by_class[class_id] = members
        memberships.extend({"class_id": class_id, "student_id": student_id} for student_id in members)
    await _owned_insert(db, school_id, ClassStudent, memberships)
    parent_links = []
    for index, parent_id in enumerate(parent_ids):
        parent_links.append({"parent_id": parent_id, "student_id": student_ids[index % len(student_ids)]})
        if index % 7 == 0:
            parent_links.append({"parent_id": parent_id, "student_id": student_ids[(index + 1) % len(student_ids)]})
    await _owned_insert(db, school_id, ParentStudent, parent_links)
    created.update({"classes": len(class_ids), "class_students": len(memberships), "parent_student_links": len(parent_links)})

    academic_start_year = reference_date.year if reference_date.month >= 9 else reference_date.year - 1
    current_years = (await db.scalars(select(AcademicYear).where(
        AcademicYear.school_id == school_id, AcademicYear.is_current.is_(True)
    ))).all()
    if len(current_years) > 1:
        raise RuntimeError(f"preflight refused: multiple current academic years: {len(current_years)}")
    existing_year = current_years[0] if current_years else None
    if existing_year and not (existing_year.start_date.date() <= reference_date <= existing_year.end_date.date()):
        raise RuntimeError("preflight refused: current academic year does not cover reference date")
    if existing_year:
        year_ids = [existing_year.id]
        created["academic_years_reused"] = 1
    else:
        year_ids = await _owned_insert(db, school_id, AcademicYear, [{"school_id": school_id, "name": f"{academic_start_year}/{academic_start_year + 1}", "start_date": datetime(academic_start_year, 9, 1), "end_date": datetime(academic_start_year + 1, 5, 31), "is_current": True}])
        created["academic_years_reused"] = 0
    period_specs = [("I четверть", (9, 1), (10, 26)), ("II четверть", (11, 5), (12, 28)), ("III четверть", (1, 12), (3, 22)), ("IV четверть", (4, 1), (5, 31))]
    period_rows = []
    for name, start_md, end_md in period_specs:
        sy = academic_start_year if start_md[0] >= 9 else academic_start_year + 1
        ey = academic_start_year if end_md[0] >= 9 else academic_start_year + 1
        start = datetime(sy, *start_md)
        end = datetime(ey, *end_md)
        period_rows.append({"academic_year_id": year_ids[0], "name": name, "period_type": "quarter", "target_grades": "[1,2,3,4,5,6,7,8,9,10,11]", "start_date": start, "end_date": end, "is_active": start.date() <= activity_date <= end.date()})
    existing_periods = (await db.scalars(select(SchoolPeriod).where(SchoolPeriod.academic_year_id == year_ids[0]).order_by(SchoolPeriod.start_date))).all()
    if existing_periods:
        if len(existing_periods) != 4 or any(left.end_date >= right.start_date for left, right in zip(existing_periods, existing_periods[1:])):
            raise RuntimeError("preflight refused: existing academic periods are incomplete or overlapping")
        expected_active = sum(period.start_date.date() <= activity_date <= period.end_date.date() for period in existing_periods)
        actual_active = sum(bool(period.is_active) for period in existing_periods)
        if actual_active != expected_active:
            raise RuntimeError("preflight refused: existing active period configuration is inconsistent")
        period_ids = [period.id for period in existing_periods]
        created["school_periods_reused"] = len(period_ids)
    else:
        period_ids = await _owned_insert(db, school_id, SchoolPeriod, period_rows)
        created["school_periods_reused"] = 0
    created.update({"academic_years": int(not existing_year), "school_periods": int(not existing_periods) * len(period_ids)})

    topic_rows = [{"school_id": school_id, "subject_id": subject_id, "name": f"{SUBJECT_NAMES[sidx]}: раздел {number}", "order_num": number} for sidx, subject_id in enumerate(subject_ids) for number in range(1, 9)]
    topic_ids = await _owned_insert(db, school_id, Topic, topic_rows)
    topics_by_subject = {subject_id: topic_ids[index * 8:(index + 1) * 8] for index, subject_id in enumerate(subject_ids)}

    assignment_rows = []
    assignment_teacher: dict[tuple[int, int], int] = {}
    schedule_rows = []
    for class_index, (class_id, grade_level) in enumerate(zip(class_ids, grades)):
        eligible = _eligible_subject_indexes(grade_level)
        for subject_index in eligible:
            teacher_id = teacher_ids[(subject_index * 4 + class_index) % len(teacher_ids)]
            assignment_teacher[(class_id, subject_ids[subject_index])] = teacher_id
            assignment_rows.append({"school_id": school_id, "teacher_id": teacher_id, "subject_id": subject_ids[subject_index], "class_id": class_id})
        for day_number in range(5):
            for lesson_number in range(1, 7):
                subject_index = eligible[(day_number * 6 + lesson_number - 1) % len(eligible)]
                subject_id = subject_ids[subject_index]
                schedule_rows.append({"school_id": school_id, "class_id": class_id, "subject_id": subject_id, "teacher_id": assignment_teacher[(class_id, subject_id)], "day_of_week": day_number, "lesson_number": lesson_number, "room": str(100 + (subject_index * 7 + class_index) % 35)})
    await _owned_insert(db, school_id, TeacherSubject, assignment_rows)
    schedule_ids = await _owned_insert(db, school_id, Schedule, schedule_rows)
    created.update({"teacher_subject_assignments": len(assignment_rows), "weekly_schedule_slots": len(schedule_rows), "topics": len(topic_ids)})

    group_rows = []
    for class_index, class_id in enumerate(class_ids):
        for half in range(2):
            group_rows.append({"school_id": school_id, "class_id": class_id, "day_of_week": class_index % 5, "lesson_number": 3, "name": f"Английский, группа {half + 1}", "room_name": str(210 + half), "teacher_id": teacher_ids[(class_index + half) % len(teacher_ids)]})
    group_ids = await _owned_insert(db, school_id, LessonGroup, group_rows)
    group_members = []
    for class_index, class_id in enumerate(class_ids):
        members = students_by_class[class_id]
        for member_index, student_id in enumerate(members):
            group_members.append({"group_id": group_ids[class_index * 2 + member_index % 2], "student_id": student_id})
    await _owned_insert(db, school_id, LessonGroupStudent, group_members)
    created.update({"lesson_groups": len(group_ids), "lesson_group_students": len(group_members)})

    monday = reference_date - timedelta(days=reference_date.weekday())
    history_mondays = [monday - timedelta(weeks=offset) for offset in reversed(range(scale.history_weeks))]
    occurrence_rows = []
    for schedule_index, schedule_row in enumerate(schedule_rows):
        for week_index, week_start in enumerate(history_mondays):
            lesson_day = week_start + timedelta(days=schedule_row["day_of_week"])
            status = "completed" if lesson_day <= reference_date else "scheduled"
            if (schedule_index + week_index) % 97 == 0:
                status = "cancelled"
            occurrence_rows.append({"school_id": school_id, "class_id": schedule_row["class_id"], "subject_id": schedule_row["subject_id"], "schedule_id": schedule_ids[schedule_index], "lesson_date": lesson_day, "lesson_number": schedule_row["lesson_number"], "teacher_id": schedule_row["teacher_id"], "status": status, "topic_id": topics_by_subject[schedule_row["subject_id"]][week_index % 8], "work_type_id": work_ids[3] if week_index % 8 == 7 else work_ids[0], "version": 1})
    occurrence_ids = await _owned_insert(db, school_id, LessonOccurrence, occurrence_rows)
    occurrences_by_class_subject: dict[tuple[int, int], list[tuple[int, date]]] = {}
    occurrence_by_id: dict[int, dict[str, Any]] = {}
    for row_id, row in zip(occurrence_ids, occurrence_rows):
        occurrence_by_id[row_id] = row
        if row["status"] == "completed":
            occurrences_by_class_subject.setdefault((row["class_id"], row["subject_id"]), []).append((row_id, row["lesson_date"]))
    created["lesson_occurrences"] = len(occurrence_ids)

    templates_per_pair = max(4, scale.history_weeks // 2)
    template_rows = []
    homework_rows = []
    control_rows = []
    for class_id, grade_level in zip(class_ids, grades):
        for subject_index in _eligible_subject_indexes(grade_level):
            subject_id = subject_ids[subject_index]
            occurrences = occurrences_by_class_subject[(class_id, subject_id)]
            for occurrence_id, lesson_day in occurrences[-templates_per_pair:]:
                template_rows.append({"school_id": school_id, "class_id": class_id, "subject_id": subject_id, "occurrence_id": occurrence_id, "lesson_date": lesson_day, "topic_id": topics_by_subject[subject_id][lesson_day.toordinal() % 8], "work_type_id": work_ids[0], "updated_by": assignment_teacher[(class_id, subject_id)]})
            homework_count = max(3, scale.history_weeks // 3)
            for occurrence_id, lesson_day in occurrences[-homework_count:]:
                homework_rows.append({"school_id": school_id, "class_id": class_id, "subject_id": subject_id, "occurrence_id": occurrence_id, "assigned_occurrence_id": occurrence_id, "teacher_id": assignment_teacher[(class_id, subject_id)], "title": f"{SUBJECT_NAMES[subject_index]}: упражнение", "description": "Повторить материал урока и выполнить задания по теме.", "due_date": datetime.combine(lesson_day + timedelta(days=7), time(18, 0)), "published_at": datetime.combine(lesson_day, time(14, 0)), "deadline_at": datetime.combine(lesson_day + timedelta(days=7), time(20, 0)), "created_at": datetime.combine(lesson_day, time(13, 45))})
            for occurrence_id, lesson_day in occurrences[-2:]:
                control_rows.append({"school_id": school_id, "class_id": class_id, "subject_id": subject_id, "occurrence_id": occurrence_id, "teacher_id": assignment_teacher[(class_id, subject_id)], "work_type": "контрольная", "title": f"Контрольная по предмету «{SUBJECT_NAMES[subject_index]}»", "work_date": datetime.combine(lesson_day, time(9, 0)), "created_at": datetime.combine(lesson_day - timedelta(days=7), time(12, 0))})
    await _owned_insert(db, school_id, LessonTemplate, template_rows)
    homework_ids = await _owned_insert(db, school_id, Homework, homework_rows)
    await _owned_insert(db, school_id, ControlWork, control_rows)
    homework_states = []
    for homework_id, homework_row in zip(homework_ids, homework_rows):
        for student_index, student_id in enumerate(students_by_class[homework_row["class_id"]]):
            roll = (homework_id * 17 + student_index * 5) % 10
            status = "completed" if roll < 7 else "in_progress" if roll < 9 else "not_started"
            completed_at = homework_row["deadline_at"] - timedelta(hours=2 + roll) if status == "completed" else None
            homework_states.append({"school_id": school_id, "homework_id": homework_id, "student_id": student_id, "status": status, "version": 1, "completed_at": completed_at, "updated_at": homework_row["deadline_at"] - timedelta(hours=roll)})
    await _owned_insert(db, school_id, HomeworkStudentState, homework_states)
    created.update({"lesson_templates": len(template_rows), "homework": len(homework_ids), "homework_states": len(homework_states), "control_works": len(control_rows)})

    numeric_grade_rows = []
    attendance_rows = []
    student_ability: dict[int, float] = {student_id: rng.gauss(0, 0.62) for student_id in student_ids}
    subject_difficulty = {subject_id: rng.uniform(-0.25, 0.25) for subject_id in subject_ids}
    for class_id, grade_level in zip(class_ids, grades):
        eligible_ids = [subject_ids[index] for index in _eligible_subject_indexes(grade_level)]
        for student_id in students_by_class[class_id]:
            for subject_id in eligible_ids:
                occurrences = occurrences_by_class_subject[(class_id, subject_id)]
                selected = [occurrences[(index * len(occurrences)) // scale.grades_per_student_subject] for index in range(scale.grades_per_student_subject)]
                for grade_index, (occurrence_id, lesson_day) in enumerate(selected):
                    raw = 3.75 + student_ability[student_id] - subject_difficulty[subject_id] + rng.gauss(0, 0.65)
                    value = max(1, min(5, round(raw)))
                    work_index = 3 if grade_index % 6 == 5 else 2 if grade_index % 4 == 3 else 0
                    weight = work_type_rows[work_ids[work_index]].weight
                    subject = subject_semantics[subject_id]
                    points = calculate_points(value, subject.category, weight, subject.profile_weight, subject.is_profile_track, bool(class_rows[class_ids.index(class_id)]["is_profile"]))
                    numeric_grade_rows.append({"school_id": school_id, "student_id": student_id, "teacher_id": assignment_teacher[(class_id, subject_id)], "class_id": class_id, "subject_id": subject_id, "occurrence_id": occurrence_id, "topic_id": topics_by_subject[subject_id][grade_index % 8], "work_type_id": work_ids[work_index], "grade_value": value, "weight": weight, "value": points, "lesson_date": datetime.combine(lesson_day, time(10, 0)), "created_at": datetime.combine(lesson_day, time(15, grade_index % 60)), "version": 1})
            all_occurrences = [item for subject_id in eligible_ids for item in occurrences_by_class_subject[(class_id, subject_id)]]
            for mark_index in range(scale.attendance_per_student):
                occurrence_id, lesson_day = all_occurrences[(student_id * 13 + mark_index * 31) % len(all_occurrences)]
                occurrence_row = occurrence_by_id[occurrence_id]
                attendance_rows.append({"school_id": school_id, "student_id": student_id, "teacher_id": occurrence_row["teacher_id"], "class_id": class_id, "subject_id": occurrence_row["subject_id"], "occurrence_id": occurrence_id, "grade_value": None, "weight": 1.0, "value": 0, "attendance_mark": ["УП", "НП", "осв."][(student_id + mark_index) % 3], "lesson_date": datetime.combine(lesson_day, time(9, 0)), "created_at": datetime.combine(lesson_day, time(9, 5)), "version": 1})
    grade_ids = await _owned_insert(db, school_id, Grade, numeric_grade_rows + attendance_rows)
    created.update({"grades_numeric": len(numeric_grade_rows), "attendance_marks": len(attendance_rows), "grades_total": len(grade_ids)})
    balances = {student_id: 0 for student_id in student_ids}
    ledger_rows = []
    grade_events: dict[int, list[tuple[int, dict[str, Any]]]] = {student_id: [] for student_id in student_ids}
    for grade_id, grade_row in zip(grade_ids, numeric_grade_rows):
        grade_events[grade_row["student_id"]].append((grade_id, grade_row))
    for student_id in student_ids:
        for grade_id, grade_row in sorted(grade_events[student_id], key=lambda item: (item[1]["created_at"], item[0])):
            previous = balances[student_id]
            balance = max(0, previous + grade_row["value"])
            balances[student_id] = balance
            ledger_rows.append({"school_id": school_id, "user_id": student_id, "amount": balance - previous, "balance_after": balance, "type": "grade", "reason": f"Оценка {grade_row['grade_value']}", "related_id": grade_id, "created_by": grade_row["teacher_id"], "created_at": grade_row["created_at"]})

    final_rows = []
    grade_cursor = 0
    if existing_periods:
        completed_periods = [period for period in existing_periods if period.end_date.date() < reference_date]
        final_period_id = completed_periods[-1].id
        final_created_at = completed_periods[-1].end_date + timedelta(days=1)
    else:
        final_index = [index for index, row in enumerate(period_rows) if row["end_date"].date() < reference_date][-1]
        final_period_id = period_ids[final_index]
        final_created_at = period_rows[final_index]["end_date"] + timedelta(days=1)
    for class_id, grade_level in zip(class_ids, grades):
        eligible_ids = [subject_ids[index] for index in _eligible_subject_indexes(grade_level)]
        for student_id in students_by_class[class_id]:
            for subject_id in eligible_ids:
                values = [row["grade_value"] for row in numeric_grade_rows[grade_cursor:grade_cursor + scale.grades_per_student_subject]]
                grade_cursor += scale.grades_per_student_subject
                final_rows.append({"school_id": school_id, "student_id": student_id, "subject_id": subject_id, "class_id": class_id, "teacher_id": assignment_teacher[(class_id, subject_id)], "period_id": final_period_id, "grade_value": max(2, min(5, round(sum(values) / len(values)))), "grade_type": "quarter", "created_at": final_created_at})
    await _owned_insert(db, school_id, FinalGrade, final_rows)
    created["final_grades"] = len(final_rows)

    existing_author = await db.scalar(select(User.id).where(User.school_id == school_id, User.role.in_(["director", "school_admin"]), User.is_active.is_(True)).order_by(User.id).limit(1))
    news_rows = [{"school_id": school_id, "title": title, "content": content, "author_id": existing_author, "is_published": 1, "created_at": datetime.combine(reference_date - timedelta(days=index * 9), time(12, 0))} for index, (title, content) in enumerate([
        ("Открытие учебного года", "Желаем школьному сообществу интересной и успешной учёбы."),
        ("Неделя науки", "В кабинетах естественных наук пройдут открытые практикумы."),
        ("Школьная олимпиада", "Опубликовано расписание предметного этапа олимпиады."),
        ("Театральная студия", "Студия приглашает зрителей на учебный спектакль."),
        ("Спортивный фестиваль", "Команды параллелей встретятся на весеннем фестивале."),
        ("Проектный день", "Ученики представят исследовательские и инженерные проекты."),
        ("Библиотечная неделя", "В библиотеке подготовлена выставка современной литературы."),
        ("Итоги четверти", "Благодарим учеников, родителей и педагогов за совместную работу."),
    ])]
    news_ids = await _owned_insert(db, school_id, News, news_rows)
    news_reads: list[dict[str, Any]] = []
    news_likes: list[dict[str, Any]] = []

    visit_rows = []
    paths = ["/student", "/student/schedule", "/student/analytics", "/market", "/quests", "/exchange"]
    for index, student_id in enumerate(student_ids):
        for visit_index in range(12):
            visit_rows.append({"school_id": school_id, "session_identifier": f"synru-{student_id}-{visit_index // 4}", "user_id": student_id, "path": paths[(index + visit_index) % len(paths)], "referrer": "/student", "user_agent": "PERUM synthetic browser", "is_mobile": (index + visit_index) % 3 == 0, "created_at": datetime.combine(activity_date - timedelta(days=(index * 3 + visit_index * 5) % 120), time(7 + visit_index % 14, (index + visit_index) % 60))})
    await _owned_insert(db, school_id, PageVisit, visit_rows)

    notification_rows = [{"school_id": school_id, "user_id": user_id, "title": "Учебное уведомление", "text": "Проверьте расписание и задания на неделю.", "type": "info", "is_read": index % 3 != 0, "created_at": datetime.combine(activity_date - timedelta(days=index % 20), time(17, 0))} for index, user_id in enumerate(student_ids + parent_ids[:len(student_ids) // 2])]
    await _owned_insert(db, school_id, Notification, notification_rows)

    shop_rows = [{"school_id": school_id, "name": name, "description": "Виртуальный предмет школьного маркета.", "price": 40 + index * 25, "item_type": "avatar" if index < 4 else "background" if index < 7 else "gift", "rarity": ["common", "rare", "epic"][index % 3], "stock": None, "is_active": True, "is_physical": False, "per_user_limit": 3} for index, name in enumerate(["Значок исследователя", "Космический аватар", "Книжный герой", "Геометрический аватар", "Фон библиотеки", "Фон лаборатории", "Фон стадиона", "Звезда поддержки", "Кубок команды", "Открытка благодарности"])]
    shop_ids = await _owned_insert(db, school_id, ShopItem, shop_rows)
    inventory_rows = []
    transaction_rows = []
    for index, student_id in enumerate(student_ids):
        balance = balances[student_id]
        for purchase_index in range(2 if index % 4 == 0 else 1):
            item_index = (index * 3 + purchase_index) % len(shop_ids)
            if balance < shop_rows[item_index]["price"]:
                continue
            purchase_time = datetime.combine(reference_date, time(18 + purchase_index, index % 60))
            inventory_rows.append({"user_id": student_id, "item_id": shop_ids[item_index], "quantity": 1, "is_equipped": purchase_index == 0 and item_index < 7, "is_issued": False, "purchased_at": purchase_time})
            balance -= shop_rows[item_index]["price"]
            transaction_rows.append({"school_id": school_id, "user_id": student_id, "amount": -shop_rows[item_index]["price"], "balance_after": balance, "type": "purchase", "reason": f"Покупка: {shop_rows[item_index]['name']}", "created_at": purchase_time})
        balances[student_id] = balance
    inventory_ids = await _owned_insert(db, school_id, UserInventory, inventory_rows)
    for transaction_row, inventory_id in zip(transaction_rows, inventory_ids):
        transaction_row["related_id"] = inventory_id
    ledger_rows.extend(transaction_rows)

    quest_specs = [("Учебная серия", "positive_grades", 5), ("Неделя без троек", "no_threes", 5), ("Регулярный вход", "daily_login", 7), ("Домашняя работа", "homework", 4), ("Читатель новостей", "daily_login", 3), ("Предметный рост", "positive_grades", 8)]
    quest_rows = [{"school_id": school_id, "title": title, "description": "Учебная цель с виртуальной наградой.", "reward": 30 + index * 10, "quest_type": quest_type, "conditions": json.dumps({"target_count": target}), "status": "available", "expires_at": datetime.combine(activity_date, time(23, 59))} for index, (title, quest_type, target) in enumerate(quest_specs)]
    quest_ids = await _owned_insert(db, school_id, Quest, quest_rows)
    user_quest_rows = []
    for index, student_id in enumerate(student_ids):
        for quest_index in range(2):
            target = quest_specs[quest_index][2]
            progress = (index + quest_index * 2) % (target + 1)
            complete = progress >= target
            user_quest_rows.append({"school_id": school_id, "user_id": student_id, "quest_id": quest_ids[quest_index], "status": "completed" if complete else "active", "progress": progress, "target": target, "started_at": datetime.combine(activity_date - timedelta(days=14), time(8, 0)), "last_updated": datetime.combine(activity_date, time(18, 0)), "completed_at": datetime.combine(activity_date, time(18, 0)) if complete else None, "reward_claimed": int(complete and index % 2 == 0)})
    await _owned_insert(db, school_id, UserQuest, user_quest_rows)

    grade_buckets: dict[tuple[int, int, int, int], list[int]] = defaultdict(list)
    for grade_row in numeric_grade_rows:
        lesson_day = grade_row["lesson_date"].date()
        iso = lesson_day.isocalendar()
        grade_buckets[(grade_row["class_id"], grade_row["subject_id"], iso.year, iso.week)].append(grade_row["grade_value"])
    average_rows = []
    averages_by_class: dict[int, list[dict[str, Any]]] = defaultdict(list)
    previous_scores: dict[tuple[int, int], float] = {}
    for (class_id, subject_id, iso_year, week), values in sorted(grade_buckets.items(), key=lambda item: (item[0][0], item[0][1], item[0][2], item[0][3])):
        score = round(sum(values) / len(values), 2)
        previous = previous_scores.get((class_id, subject_id))
        change = round(((score / previous) - 1) * 100, 2) if previous else 0.0
        week_end = date.fromisocalendar(iso_year, week, 7)
        row = {"school_id": school_id, "class_id": class_id, "subject_id": subject_id, "week_number": week, "academic_year": academic_start_year, "average_score": score, "index_change": change, "created_at": datetime.combine(min(week_end, reference_date), time(20, 0))}
        average_rows.append(row)
        averages_by_class[class_id].append(row)
        previous_scores[(class_id, subject_id)] = score
    await _owned_insert(db, school_id, SubjectAverage, average_rows)
    average_weeks = sorted({(row["week_number"], row["academic_year"]) for row in average_rows})[-4:]
    window_rows = []
    for week, year in average_weeks:
        iso_year = academic_start_year + 1 if week < 35 else academic_start_year
        week_monday = date.fromisocalendar(iso_year, week, 1)
        window_rows.append({"school_id": school_id, "week_number": week, "academic_year": year, "opens_at": datetime.combine(week_monday, time(8, 0)), "closes_at": datetime.combine(min(week_monday + timedelta(days=4), reference_date), time(23, 59)), "is_active": False})
    await _owned_insert(db, school_id, TradingWindow, window_rows)
    investment_rows = []
    exchange_rows = []
    class_for_student = {student_id: class_id for class_id, members in students_by_class.items() for student_id in members}
    tradable_weeks = set(average_weeks)
    for index, student_id in enumerate(student_ids):
        for investment_index in range(2):
            amount = 20 + (index * 7 + investment_index * 10) % 80
            if balances[student_id] < amount:
                continue
            class_id = class_for_student[student_id]
            candidates = [point for point in averages_by_class[class_id] if (point["week_number"], point["academic_year"]) in tradable_weeks]
            point = candidates[(index * 3 + investment_index) % len(candidates)]
            result = int(amount * (1 + point["index_change"] / 100))
            iso_year = academic_start_year + 1 if point["week_number"] < 35 else academic_start_year
            week_monday = date.fromisocalendar(iso_year, point["week_number"], 1)
            created_at = datetime.combine(week_monday, time(9 + investment_index, index % 60))
            completed_at = datetime.combine(min(week_monday + timedelta(days=6), reference_date), time(20, investment_index))
            subject_id = point["subject_id"]
            investment_rows.append({"school_id": school_id, "user_id": student_id, "subject_id": subject_id, "amount": amount, "week_number": point["week_number"], "academic_year": point["academic_year"], "result_amount": result, "index_change": point["index_change"], "status": "completed", "created_at": created_at, "completed_at": completed_at})
            exchange_rows.append({"school_id": school_id, "user_id": student_id, "subject_id": subject_id, "action": "invest", "amount": amount, "price": point["average_score"], "created_at": created_at})
            exchange_rows.append({"school_id": school_id, "user_id": student_id, "subject_id": subject_id, "action": "dividend", "amount": result, "price": point["average_score"], "created_at": completed_at})
            balances[student_id] -= amount
            debit_row = {"school_id": school_id, "user_id": student_id, "amount": -amount, "balance_after": balances[student_id], "type": "exchange_invest", "reason": "Вложение в предмет", "created_at": created_at}
            ledger_rows.append(debit_row)
            balances[student_id] += result
            payout_row = {"school_id": school_id, "user_id": student_id, "amount": result, "balance_after": balances[student_id], "type": "exchange_result", "reason": "Результат вложения", "created_at": completed_at}
            ledger_rows.append(payout_row)
            debit_row["_investment_index"] = len(investment_rows) - 1
            payout_row["_investment_index"] = len(investment_rows) - 1
    investment_ids = await _owned_insert(db, school_id, Investment, investment_rows)
    for row in ledger_rows:
        investment_index = row.pop("_investment_index", None)
        if investment_index is not None:
            row["related_id"] = investment_ids[investment_index]
    await _owned_insert(db, school_id, ExchangeLog, exchange_rows)
    settings_rows = (await db.scalars(select(ExchangeSettings).where(ExchangeSettings.school_id == school_id))).all()
    if len(settings_rows) > 1:
        raise RuntimeError(f"preflight refused: ambiguous exchange settings: {len(settings_rows)} rows")
    if not settings_rows:
        await _owned_insert(db, school_id, ExchangeSettings, [{"school_id": school_id, "open_day": 1, "open_time": "08:00", "close_day": 5, "close_time": "18:00", "calc_day": 7, "calc_time": "20:30"}])
        created["exchange_settings"] = 1
        created["exchange_settings_reused"] = 0
    else:
        created["exchange_settings"] = 0
        created["exchange_settings_reused"] = 1
    transaction_order = {"grade": 0, "purchase": 1, "exchange_invest": 2, "exchange_result": 3}
    ordered_ledger = []
    final_balances = {}
    for student_id in student_ids:
        student_rows = sorted(
            (row for row in ledger_rows if row["user_id"] == student_id),
            key=lambda row: (row["created_at"], transaction_order[row["type"]], row.get("related_id", 0)),
        )
        balance = 0
        for row in student_rows:
            previous = balance
            balance = max(0, balance + row["amount"])
            row["amount"] = balance - previous
            row["balance_after"] = balance
            ordered_ledger.append(row)
        final_balances[student_id] = balance
    ledger_rows = ordered_ledger
    await _owned_insert(db, school_id, Transaction, ledger_rows)
    await db.execute(update(User), [{"id": student_id, "balance": balance} for student_id, balance in final_balances.items()])
    created.update({"page_visits": len(visit_rows), "news": len(news_ids), "news_reads": len(news_reads), "news_likes": len(news_likes), "notifications": len(notification_rows), "shop_items": len(shop_ids), "inventory": len(inventory_rows), "transactions": len(ledger_rows), "purchase_transactions": len(transaction_rows), "grade_transactions": len(numeric_grade_rows), "investment_transactions": len(investment_rows) * 2, "quests": len(quest_ids), "user_quests": len(user_quest_rows), "subject_average_points": len(average_rows), "trading_windows": len(window_rows), "investments": len(investment_rows), "exchange_logs": len(exchange_rows)})

    if persona_hash:
        persona_ids = [user_id for user_id, row in zip(user_ids, user_rows) if row["login"] in persona_logins.values()]
        await db.execute(update(User).where(User.id.in_(persona_ids)).values(is_active=True))
    created["ownership_rows"] = await db.scalar(select(func.count()).select_from(SyntheticSeedRow).where(
        SyntheticSeedRow.namespace == NAMESPACE, SyntheticSeedRow.school_id == school_id
    ))
    created["marker_rows"] = 1
    marker_value = json.dumps({"status": "complete", "scale": scale_name, "seed": RANDOM_SEED, "reference_date": reference_date.isoformat(), "activity_date": activity_date.isoformat(), "run_token": run_token, "personas_activated": bool(persona_hash)}, separators=(",", ":"))
    await db.execute(update(TenantMeta).where(TenantMeta.key == _marker_key(school_id)).values(value=marker_value))
    await db.commit()
    result = {"namespace": NAMESPACE, "school_id": school_id, "scale": scale_name, "reference_date": reference_date.isoformat(), "activity_date": activity_date.isoformat(), "account_status": "three personas active" if persona_hash else "all synthetic accounts inactive", "created": created, "rebuild_deleted": deleted}
    if persona_hash:
        result["test_logins"] = persona_logins
    return result


async def seed_synthetic(db: AsyncSession, school_id: int, scale_name: str, persona_hash: str | None = None, rebuild: bool = False, reference_date: date | None = None, activity_date: date | None = None) -> dict[str, Any]:
    reference_date = reference_date or default_reference_date()
    activity_date = activity_date or date.today()
    if activity_date < reference_date:
        raise ValueError("activity date cannot be before reference date")
    run_token = secrets.token_urlsafe(24)
    connection, process_lock = await _acquire_lock(db, school_id)
    try:
        return await _seed_synthetic_impl(db, school_id, scale_name, persona_hash, rebuild, reference_date, activity_date, run_token)
    except Exception:
        await db.rollback()
        marker = await db.get(TenantMeta, _marker_key(school_id))
        marker_data = json.loads(marker.value) if marker is not None else {}
        if marker_data.get("status") == "building" and marker_data.get("run_token") == run_token:
            try:
                await rebuild_owned(db, school_id)
            except Exception as cleanup_error:
                await db.rollback()
                marker = await db.get(TenantMeta, _marker_key(school_id))
                marker_data = json.loads(marker.value) if marker is not None else {}
                if marker is not None and marker_data.get("run_token") == run_token:
                    marker.value = json.dumps({"status": "failed", "cleanup": "failed", "error": type(cleanup_error).__name__, "run_token": run_token}, separators=(",", ":"))
                    await db.commit()
        raise
    finally:
        await _release_lock(connection, process_lock, school_id)


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Deterministic synthetic Russian school dataset")
    parser.add_argument("--school-id", type=int, default=None)
    parser.add_argument("--scale", choices=tuple(SCALES), default="medium")
    parser.add_argument("--rebuild", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--reference-date", type=date.fromisoformat, default=None)
    parser.add_argument("--activity-date", type=date.fromisoformat, default=None)
    parser.add_argument("--activate-personas", action="store_true")
    return parser


async def _main(args: argparse.Namespace) -> None:
    school_id = args.school_id or int(os.environ.get(SCHOOL_ENV, "0"))
    if school_id <= 0:
        raise SystemExit(f"--school-id or {SCHOOL_ENV} is required")
    if args.dry_run:
        async with SessionLocal() as db:
            if await db.get(School, school_id) is None:
                raise SystemExit(f"school {school_id} does not exist")
        print(json.dumps({"dry_run": True, "school_id": school_id, "activity_date": (args.activity_date or date.today()).isoformat(), "activate_personas": args.activate_personas, "plan": build_plan(args.scale, args.reference_date)}, ensure_ascii=False, indent=2))
        return
    password_hash = None
    if args.activate_personas:
        password = os.environ.get(PASSWORD_ENV)
        if not password:
            raise SystemExit(f"{PASSWORD_ENV} is required with --activate-personas")
        password_hash = hash_password(password)
    async with SessionLocal() as db:
        result = await seed_synthetic(db, school_id, args.scale, password_hash, args.rebuild, args.reference_date, args.activity_date)
    print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    asyncio.run(_main(_parser().parse_args()))
