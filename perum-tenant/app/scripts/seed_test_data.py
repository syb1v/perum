"""Demo data for manual verification: teachers, classes, students, assignments,
academic year + periods, a bell schedule, a weekly schedule, and grades.

Run inside the tenant container:
    python -m app.scripts.seed_test_data

All demo users share the password `test1234`. Two idempotent phases (structure,
grades) — safe to re-run; each phase skips if its data already exists.
"""

from __future__ import annotations

import asyncio
import logging
import random
from datetime import datetime

from sqlalchemy import func, select, update

from app.core.db import SessionLocal
from app.core.security import hash_password
from app.models import ParentStudent, School, Subject, User
from app.models.academic import (
    AcademicYear,
    BellSchedule,
    BellScheduleItem,
    Class,
    ClassStudent,
    Schedule,
    SchoolPeriod,
    TeacherSubject,
)
from app.models.journal import FinalGrade, Grade, Transaction
from app.services.points_calculator import calculate_points

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("perum.tenant.seed_test")

DEMO_PASSWORD = "test1234"

TEACHERS = [
    ("petrov", "Пётр", "Петров", "Математика"),
    ("ivanova", "Ирина", "Иванова", "Русский язык"),
    ("kuznetsov", "Алексей", "Кузнецов", "Физика"),
    ("smirnova", "Светлана", "Смирнова", "Химия"),
    ("popov", "Дмитрий", "Попов", "История"),
]
CLASSES = [("5А", 5, 0), ("6Б", 6, 0), ("10А", 10, 1), ("11А", 11, 1)]
STUDENT_POOL = [
    ("Анна", "Соколова"), ("Иван", "Морозов"), ("Мария", "Волкова"), ("Никита", "Зайцев"),
    ("Елена", "Павлова"), ("Артём", "Козлов"), ("Дарья", "Лебедева"), ("Максим", "Новиков"),
    ("София", "Ковалёва"), ("Егор", "Орлов"), ("Полина", "Макарова"), ("Кирилл", "Андреев"),
    ("Виктория", "Романова"), ("Михаил", "Захаров"), ("Алиса", "Васильева"), ("Тимур", "Фролов"),
    ("Ксения", "Сергеева"), ("Роман", "Гусев"), ("Вероника", "Титова"), ("Глеб", "Беляев"),
    ("Алина", "Комарова"), ("Денис", "Киселёв"), ("Ева", "Борисова"), ("Степан", "Герасимов"),
]
SCHEDULE_SUBJECTS = ["Математика", "Русский язык", "Физика", "Химия", "История"]
GRADE_SUBJECTS = ["Математика", "Русский язык", "Физика"]
GRADE_VALUE_POOL = [3, 3, 4, 4, 4, 5, 5, 5]  # weighted toward 4–5


async def _seed_structure(db, sid: int, pwd: str) -> None:
    if await db.scalar(select(func.count()).select_from(Class).where(Class.school_id == sid)):
        logger.info("structure already present — skipping")
        return

    subjects = {s.name: s for s in (await db.execute(select(Subject).where(Subject.school_id == sid))).scalars().all()}

    year = AcademicYear(
        school_id=sid, name="2025-2026", start_date=datetime(2025, 9, 1),
        end_date=datetime(2026, 5, 31), is_current=True,
    )
    db.add(year)
    await db.flush()
    for qname, qs, qe in [
        ("1 четверть", datetime(2025, 9, 1), datetime(2025, 10, 31)),
        ("2 четверть", datetime(2025, 11, 10), datetime(2025, 12, 28)),
        ("3 четверть", datetime(2026, 1, 12), datetime(2026, 3, 22)),
        ("4 четверть", datetime(2026, 4, 1), datetime(2026, 5, 31)),
    ]:
        db.add(SchoolPeriod(
            academic_year_id=year.id, name=qname, period_type="quarter",
            start_date=qs, end_date=qe, is_active=True, target_grades="[1,2,3,4,5,6,7,8,9,10,11]",
        ))

    bell = BellSchedule(school_id=sid, name="Основная смена")
    db.add(bell)
    await db.flush()
    starts = ["08:30", "09:25", "10:30", "11:25", "12:20", "13:15", "14:10"]
    ends = ["09:10", "10:05", "11:10", "12:05", "13:00", "13:55", "14:50"]
    for n, (st, en) in enumerate(zip(starts, ends), start=1):
        db.add(BellScheduleItem(bell_schedule_id=bell.id, lesson_number=n, start_time=st, end_time=en))

    teachers: dict[str, User] = {}
    for login, first, last, _subj in TEACHERS:
        t = User(
            school_id=sid, role="teacher", login=login, email=f"{login}@acme.ru",
            first_name=first, last_name=last, password_hash=pwd, is_active=True,
        )
        db.add(t)
        teachers[login] = t
    await db.flush()

    teacher_list = list(teachers.values())
    classes: list[Class] = []
    for i, (cname, grade, profile) in enumerate(CLASSES):
        c = Class(
            school_id=sid, name=cname, grade_level=grade, is_profile=profile,
            teacher_id=teacher_list[i % len(teacher_list)].id, bell_schedule_id=bell.id,
        )
        db.add(c)
        classes.append(c)
    await db.flush()

    pool = iter(STUDENT_POOL * 2)
    sidx = 0
    for c in classes:
        for _ in range(6):
            first, last = next(pool)
            sidx += 1
            stu = User(
                school_id=sid, role="student", login=f"student{sidx}", email=f"student{sidx}@acme.ru",
                first_name=first, last_name=last, password_hash=pwd, is_active=True,
                balance=random.randint(50, 300),
            )
            db.add(stu)
            await db.flush()
            db.add(ClassStudent(class_id=c.id, student_id=stu.id))

    for login, _f, _l, subj_name in TEACHERS:
        subj = subjects.get(subj_name)
        if subj is None:
            continue
        for c in classes:
            db.add(TeacherSubject(school_id=sid, teacher_id=teachers[login].id, subject_id=subj.id, class_id=c.id))

    target = next((c for c in classes if c.name == "10А"), classes[0])
    teacher_by_subject = {subj: teachers[login] for login, _f, _l, subj in TEACHERS}
    for day in range(5):
        for lesson in range(1, 6):
            subj_name = SCHEDULE_SUBJECTS[(day + lesson) % len(SCHEDULE_SUBJECTS)]
            subj = subjects.get(subj_name)
            teacher = teacher_by_subject.get(subj_name)
            if subj is None:
                continue
            db.add(Schedule(
                school_id=sid, class_id=target.id, subject_id=subj.id,
                teacher_id=teacher.id if teacher else None,
                day_of_week=day, lesson_number=lesson, room=f"{200 + lesson}",
            ))

    await db.commit()
    logger.info("seeded structure: %d teachers, %d classes, %d students", len(TEACHERS), len(classes), sidx)


async def _seed_grades(db, sid: int) -> None:
    if await db.scalar(select(func.count()).select_from(Grade).where(Grade.school_id == sid)):
        logger.info("grades already present — skipping")
        return

    subjects = {s.name: s for s in (await db.execute(select(Subject).where(Subject.school_id == sid))).scalars().all()}
    classes = (await db.execute(select(Class).where(Class.school_id == sid))).scalars().all()
    ts_rows = (await db.execute(select(TeacherSubject).where(TeacherSubject.school_id == sid))).scalars().all()
    teacher_for = {(t.subject_id, t.class_id): t.teacher_id for t in ts_rows}

    balances: dict[int, int] = {}
    total = 0
    for c in classes:
        class_is_profile = c.is_profile == 1
        students = (
            await db.execute(
                select(User).join(ClassStudent, ClassStudent.student_id == User.id).where(ClassStudent.class_id == c.id)
            )
        ).scalars().all()
        for subj_name in GRADE_SUBJECTS:
            subj = subjects.get(subj_name)
            if subj is None:
                continue
            tid = teacher_for.get((subj.id, c.id))
            for stu in students:
                balances.setdefault(stu.id, stu.balance or 0)
                for d in range(3):  # 3 grades, dated within Q4 (current period)
                    val = random.choice(GRADE_VALUE_POOL)
                    pts = calculate_points(
                        val, subj.category, 1.0, subj.profile_weight, subj.is_profile_track, class_is_profile
                    )
                    g = Grade(
                        school_id=sid, student_id=stu.id, teacher_id=tid, class_id=c.id,
                        subject_id=subj.id, grade_value=val, weight=1.0, value=pts,
                        lesson_date=datetime(2026, 5, 5 + d * 5),
                    )
                    db.add(g)
                    await db.flush()
                    balances[stu.id] = max(balances[stu.id] + pts, 0)
                    db.add(Transaction(
                        school_id=sid, user_id=stu.id, amount=pts, balance_after=balances[stu.id],
                        type="grade", reason=f"Оценка {val} по «{subj.name}»", related_id=g.id, created_by=tid,
                    ))
                    total += 1

    for stu_id, bal in balances.items():
        await db.execute(update(User).where(User.id == stu_id).values(balance=bal))
    await db.commit()
    logger.info("seeded %d grades across %d classes", total, len(classes))


async def _seed_schedules(db, sid: int) -> None:
    """Give every class a weekly schedule (so any student's diary is populated).

    Idempotent per class: classes that already have schedule rows are left alone.
    """
    subjects = {s.name: s for s in (await db.execute(select(Subject).where(Subject.school_id == sid))).scalars().all()}
    classes = (await db.execute(select(Class).where(Class.school_id == sid))).scalars().all()
    teachers = {
        u.id: u for u in (await db.execute(select(User).where(User.school_id == sid, User.role == "teacher"))).scalars().all()
    }
    ts_rows = (await db.execute(select(TeacherSubject).where(TeacherSubject.school_id == sid))).scalars().all()
    teacher_for = {(t.subject_id, t.class_id): t.teacher_id for t in ts_rows}

    added = 0
    for c in classes:
        if await db.scalar(select(func.count()).select_from(Schedule).where(Schedule.class_id == c.id)):
            continue
        for day in range(5):
            for lesson in range(1, 6):
                subj_name = SCHEDULE_SUBJECTS[(day + lesson) % len(SCHEDULE_SUBJECTS)]
                subj = subjects.get(subj_name)
                if subj is None:
                    continue
                tid = teacher_for.get((subj.id, c.id))
                db.add(Schedule(
                    school_id=sid, class_id=c.id, subject_id=subj.id,
                    teacher_id=tid, day_of_week=day, lesson_number=lesson, room=f"{200 + lesson}",
                ))
                added += 1
    if added:
        await db.commit()
        logger.info("seeded %d schedule slots across classes", added)
    else:
        logger.info("schedules already present — skipping")


async def _seed_finals(db, sid: int) -> None:
    """Final (quarter) grades for the current period, rounded from each student's
    weighted average per subject — so the «итоговые оценки» view has data."""
    if await db.scalar(select(func.count()).select_from(FinalGrade).where(FinalGrade.school_id == sid)):
        logger.info("final grades already present — skipping")
        return

    # Current quarter = the one containing today (fallback: last quarter).
    periods = (
        await db.execute(
            select(SchoolPeriod)
            .join(AcademicYear, AcademicYear.id == SchoolPeriod.academic_year_id)
            .where(AcademicYear.school_id == sid, SchoolPeriod.period_type == "quarter")
            .order_by(SchoolPeriod.start_date)
        )
    ).scalars().all()
    if not periods:
        logger.info("no quarters — skipping finals")
        return
    now = datetime.now()
    period = next((p for p in periods if p.start_date <= now <= p.end_date), periods[-1])

    classes = (await db.execute(select(Class).where(Class.school_id == sid))).scalars().all()
    ts_rows = (await db.execute(select(TeacherSubject).where(TeacherSubject.school_id == sid))).scalars().all()
    teacher_for = {(t.subject_id, t.class_id): t.teacher_id for t in ts_rows}

    added = 0
    for c in classes:
        students = (
            await db.execute(
                select(User).join(ClassStudent, ClassStudent.student_id == User.id).where(ClassStudent.class_id == c.id)
            )
        ).scalars().all()
        for stu in students:
            rows = (
                await db.execute(
                    select(Grade.subject_id, func.avg(Grade.grade_value))
                    .where(Grade.student_id == stu.id, Grade.school_id == sid, Grade.grade_value.isnot(None))
                    .group_by(Grade.subject_id)
                )
            ).all()
            for subject_id, avg in rows:
                final_val = max(2, min(5, round(avg or 0)))
                db.add(FinalGrade(
                    school_id=sid, student_id=stu.id, subject_id=subject_id, class_id=c.id,
                    teacher_id=teacher_for.get((subject_id, c.id)), period_id=period.id,
                    grade_value=final_val, grade_type="quarter",
                ))
                added += 1
    if added:
        await db.commit()
        logger.info("seeded %d final grades for period «%s»", added, period.name)


async def _seed_parents(db, sid: int, pwd: str) -> None:
    """One demo parent (`parent1`) linked to the first two 5А students."""
    if await db.scalar(select(func.count()).select_from(User).where(User.school_id == sid, User.role == "parent")):
        logger.info("parents already present — skipping")
        return
    kids = (
        await db.execute(
            select(User)
            .join(ClassStudent, ClassStudent.student_id == User.id)
            .join(Class, Class.id == ClassStudent.class_id)
            .where(Class.school_id == sid, User.role == "student")
            .order_by(User.id)
            .limit(2)
        )
    ).scalars().all()
    if not kids:
        logger.info("no students — skipping parents")
        return
    parent = User(
        school_id=sid, role="parent", login="parent1", email="parent1@acme.ru",
        first_name="Ольга", last_name="Соколова", password_hash=pwd, is_active=True,
    )
    db.add(parent)
    await db.flush()
    for kid in kids:
        db.add(ParentStudent(parent_id=parent.id, student_id=kid.id))
    await db.commit()
    logger.info("seeded parent1 linked to %d children", len(kids))


async def seed() -> None:
    pwd = hash_password(DEMO_PASSWORD)
    async with SessionLocal() as db:
        school = (await db.execute(select(School).order_by(School.id).limit(1))).scalar_one_or_none()
        if school is None:
            logger.error("no school — run seed_defaults first")
            return
        await _seed_structure(db, school.id, pwd)
        await _seed_grades(db, school.id)
        await _seed_schedules(db, school.id)
        await _seed_finals(db, school.id)
        await _seed_parents(db, school.id, pwd)


if __name__ == "__main__":
    asyncio.run(seed())
