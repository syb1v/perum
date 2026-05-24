"""Demo data for manual verification: teachers, classes, students, assignments,
academic year + periods, a bell schedule, and a weekly schedule for one class.

Run inside the tenant container:
    python -m app.scripts.seed_test_data

All demo users share the password `test1234` (so you can log in as a teacher
or a student too). Idempotent: skips if classes already exist.
"""

from __future__ import annotations

import asyncio
import logging
import random
from datetime import datetime

from sqlalchemy import func, select

from app.core.db import SessionLocal
from app.core.security import hash_password
from app.models import School, Subject, User
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


async def seed() -> None:
    pwd = hash_password(DEMO_PASSWORD)
    async with SessionLocal() as db:
        school = (await db.execute(select(School).order_by(School.id).limit(1))).scalar_one_or_none()
        if school is None:
            logger.error("no school — run seed_defaults first")
            return
        sid = school.id

        existing = await db.scalar(select(func.count()).select_from(Class).where(Class.school_id == sid))
        if existing:
            logger.info("test data already present (%s classes) — skipping", existing)
            return

        # Subjects by name (seeded by seed_defaults).
        subjects = {
            s.name: s
            for s in (
                await db.execute(select(Subject).where(Subject.school_id == sid))
            ).scalars().all()
        }

        # Academic year + 4 quarters.
        year = AcademicYear(
            school_id=sid,
            name="2025-2026",
            start_date=datetime(2025, 9, 1),
            end_date=datetime(2026, 5, 31),
            is_current=True,
        )
        db.add(year)
        await db.flush()
        quarters = [
            ("1 четверть", datetime(2025, 9, 1), datetime(2025, 10, 31)),
            ("2 четверть", datetime(2025, 11, 10), datetime(2025, 12, 28)),
            ("3 четверть", datetime(2026, 1, 12), datetime(2026, 3, 22)),
            ("4 четверть", datetime(2026, 4, 1), datetime(2026, 5, 31)),
        ]
        for qname, qs, qe in quarters:
            db.add(
                SchoolPeriod(
                    academic_year_id=year.id,
                    name=qname,
                    period_type="quarter",
                    start_date=qs,
                    end_date=qe,
                    is_active=True,
                    target_grades="[1,2,3,4,5,6,7,8,9,10,11]",
                )
            )

        # Bell schedule (main shift).
        bell = BellSchedule(school_id=sid, name="Основная смена")
        db.add(bell)
        await db.flush()
        starts = ["08:30", "09:25", "10:30", "11:25", "12:20", "13:15", "14:10"]
        ends = ["09:10", "10:05", "11:10", "12:05", "13:00", "13:55", "14:50"]
        for n, (st, en) in enumerate(zip(starts, ends), start=1):
            db.add(BellScheduleItem(bell_schedule_id=bell.id, lesson_number=n, start_time=st, end_time=en))

        # Teachers.
        teachers: dict[str, User] = {}
        for login, first, last, _subj in TEACHERS:
            t = User(
                school_id=sid, role="teacher", login=login, email=f"{login}@acme.ru",
                first_name=first, last_name=last, password_hash=pwd, is_active=True,
            )
            db.add(t)
            teachers[login] = t
        await db.flush()

        # Classes (homeroom teacher cycles through teachers; main bell schedule).
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

        # Students (6 per class) + memberships.
        pool = iter(STUDENT_POOL * 2)
        sidx = 0
        for c in classes:
            for _ in range(6):
                first, last = next(pool)
                sidx += 1
                stu = User(
                    school_id=sid, role="student", login=f"student{sidx}",
                    email=f"student{sidx}@acme.ru", first_name=first, last_name=last,
                    password_hash=pwd, is_active=True, balance=random.randint(50, 500),
                )
                db.add(stu)
                await db.flush()
                db.add(ClassStudent(class_id=c.id, student_id=stu.id))

        # Teacher↔subject↔class assignments (each teacher teaches their subject in every class).
        for login, _first, _last, subj_name in TEACHERS:
            subj = subjects.get(subj_name)
            if subj is None:
                continue
            for c in classes:
                db.add(
                    TeacherSubject(
                        school_id=sid, teacher_id=teachers[login].id, subject_id=subj.id, class_id=c.id
                    )
                )

        # Weekly schedule for the first profile class (10А): Mon–Fri, 5 lessons.
        target = next((c for c in classes if c.name == "10А"), classes[0])
        teacher_by_subject = {subj: teachers[login] for login, _f, _l, subj in TEACHERS}
        for day in range(5):  # 0=Mon .. 4=Fri
            for lesson in range(1, 6):
                subj_name = SCHEDULE_SUBJECTS[(day + lesson) % len(SCHEDULE_SUBJECTS)]
                subj = subjects.get(subj_name)
                teacher = teacher_by_subject.get(subj_name)
                if subj is None:
                    continue
                db.add(
                    Schedule(
                        school_id=sid, class_id=target.id, subject_id=subj.id,
                        teacher_id=teacher.id if teacher else None,
                        day_of_week=day, lesson_number=lesson, room=f"{200 + lesson}",
                    )
                )

        await db.commit()
        logger.info(
            "seeded demo data: %d teachers, %d classes, %d students, schedule for %s",
            len(TEACHERS), len(classes), sidx, target.name,
        )


if __name__ == "__main__":
    asyncio.run(seed())
