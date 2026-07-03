"""Seed a school tenant DB with realistic demo data for investor demos.

Run inside the school tenant app container:

    docker exec -e SCHOOL_NAME="ГРСН Лицей" school_<slug>_app python /tmp/seed_demo.py

The script expects DATABASE_URL to point at the school postgres DB and ORG_NAME/
ORG_SLUG to identify the organization.
"""

from __future__ import annotations

import os
import random
from datetime import datetime, timedelta

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings
from app.core.security import hash_password
from app.models import (
    Base,
    BellSchedule,
    BellScheduleItem,
    Class,
    ClassStudent,
    Grade,
    Organization,
    Schedule,
    School,
    ShopItem,
    Subject,
    TeacherSubject,
    Topic,
    Transaction,
    User,
    WorkType,
)

DEMO_PASSWORD = "demo123"
DEMO_PASSWORD_HASH = hash_password(DEMO_PASSWORD)

FIRST_NAMES_M = ["Александр", "Михаил", "Максим", "Артём", "Иван", "Дмитрий", "Матвей", "Лев"]
FIRST_NAMES_F = ["София", "Анна", "Мария", "Алиса", "Виктория", "Полина", "Ева", "Елизавета"]
LAST_NAMES_M = ["Иванов", "Смирнов", "Кузнецов", "Попов", "Васильев", "Петров", "Соколов", "Михайлов"]
LAST_NAMES_F = ["Иванова", "Смирнова", "Кузнецова", "Попова", "Васильева", "Петрова", "Соколова", "Михайлова"]


def _random_date(start: datetime, end: datetime) -> datetime:
    delta = end - start
    return start + timedelta(seconds=random.randint(0, int(delta.total_seconds())))


def _make_user(
    session: Session,
    role: str,
    school_id: int | None,
    first: str,
    last: str,
    login_suffix: str,
    patronymic: str | None = None,
    login: str | None = None,
    password_hash: str | None = None,
) -> User:
    actual_login = login if login else f"{first.lower()}.{last.lower()}.{login_suffix}"
    user = User(
        school_id=school_id,
        role=role,
        login=actual_login,
        email=f"{actual_login}@grsn-demo.local",
        first_name=first,
        last_name=last,
        patronymic=patronymic,
        password_hash=password_hash if password_hash else DEMO_PASSWORD_HASH,
        is_active=True,
        must_change_password=False,
        balance=random.randint(50, 500) if role == "student" else 0,
    )
    session.add(user)
    session.flush()
    return user


def seed_org_and_school(session: Session) -> tuple[Organization, School]:
    org_slug = os.getenv("ORG_SLUG", "academy-grsn")
    org_name = os.getenv("ORG_NAME", "Академия ГРСН")
    school_name = os.getenv("SCHOOL_NAME", "ГРСН Школа")

    org = session.query(Organization).filter(Organization.slug == org_slug).first()
    if org is None:
        org = Organization(slug=org_slug, name=org_name)
        session.add(org)
        session.flush()

    school = session.query(School).filter(School.org_id == org.id).first()
    if school is None:
        school = School(org_id=org.id, name=school_name, is_active=True)
        session.add(school)
        session.flush()

    return org, school


def seed_admin(session: Session, org: Organization) -> User:
    admin = session.query(User).filter(User.role == "org_admin").first()
    if admin is None:
        admin = _make_user(session, "org_admin", None, "Артём", "Сергеев", "admin")
    return admin


def seed_subjects(session: Session, school: School) -> list[Subject]:
    subjects_data = [
        {"name": "Математика", "short_name": "Мат."},
        {"name": "Русский язык", "short_name": "Рус."},
        {"name": "История", "short_name": "Ист."},
        {"name": "Физика", "short_name": "Физ."},
        {"name": "Информатика", "short_name": "Инф."},
        {"name": "Английский язык", "short_name": "Англ."},
    ]
    subjects = []
    for data in subjects_data:
        subj = session.query(Subject).filter(Subject.school_id == school.id, Subject.name == data["name"]).first()
        if subj is None:
            subj = Subject(
                school_id=school.id,
                name=data["name"],
                short_name=data["short_name"],
                category="normal",
                in_exchange=True,
                exchange_coefficient=1.0,
                profile_weight=1.0,
            )
            session.add(subj)
            session.flush()
        subjects.append(subj)
    return subjects


def seed_work_types(session: Session, school: School) -> list[WorkType]:
    work_types_data = [
        {"name": "Контрольная работа", "weight": 1.0},
        {"name": "Самостоятельная работа", "weight": 0.8},
        {"name": "Устный ответ", "weight": 0.6},
        {"name": "Домашняя работа", "weight": 0.5},
    ]
    work_types = []
    for data in work_types_data:
        wt = session.query(WorkType).filter(WorkType.school_id == school.id, WorkType.name == data["name"]).first()
        if wt is None:
            wt = WorkType(school_id=school.id, name=data["name"], weight=data["weight"])
            session.add(wt)
            session.flush()
        work_types.append(wt)
    return work_types


def seed_bell_schedule(session: Session, school: School) -> BellSchedule:
    bell = session.query(BellSchedule).filter(BellSchedule.school_id == school.id, BellSchedule.name == "Основной").first()
    if bell is None:
        bell = BellSchedule(school_id=school.id, name="Основной")
        session.add(bell)
        session.flush()
        times = [
            (1, "08:00", "08:45", False),
            (2, "08:55", "09:40", False),
            (3, "09:50", "10:35", False),
            (4, "10:45", "11:30", False),
            (5, "11:40", "12:25", False),
            (6, "12:35", "13:20", False),
            (1, "08:00", "08:45", True),
            (2, "08:55", "09:40", True),
            (3, "09:50", "10:35", True),
            (4, "10:45", "11:30", True),
        ]
        for num, start, end, is_sat in times:
            session.add(BellScheduleItem(
                bell_schedule_id=bell.id,
                lesson_number=num,
                start_time=start,
                end_time=end,
                is_saturday=is_sat,
            ))
    return bell


def seed_classes(session: Session, school: School, bell: BellSchedule) -> list[Class]:
    classes_data = ["5 А", "5 Б", "6 А"]
    classes = []
    for name in classes_data:
        cls = session.query(Class).filter(Class.school_id == school.id, Class.name == name).first()
        if cls is None:
            cls = Class(
                school_id=school.id,
                name=name,
                grade_level=int(name.split()[0]),
                teacher_id=None,
                bell_schedule_id=bell.id,
            )
            session.add(cls)
            session.flush()
        elif cls.bell_schedule_id is None:
            cls.bell_schedule_id = bell.id
        classes.append(cls)
    return classes


def seed_teachers(session: Session, school: School, subjects: list[Subject], classes: list[Class]) -> list[User]:
    # Первый учитель — точное совпадение с презентацией для инвестора.
    teachers_data = [
        {
            "first": "Анатолия",
            "last": "Меркурьева",
            "patronymic": "Марсовна",
            "login": "tea_1_9n5u",
            "password": "oElzsp7LNX",
        },
        {"first": "Сергей", "last": "Петров", "login": "teacher2"},
        {"first": "Ольга", "last": "Кузнецова", "login": "teacher3"},
    ]
    teachers = []
    for data in teachers_data:
        login = data["login"]
        teacher = session.query(User).filter(User.login == login).first()
        if teacher is None:
            pw_hash = hash_password(data["password"]) if "password" in data else None
            teacher = _make_user(
                session,
                "teacher",
                school.id,
                data["first"],
                data["last"],
                login,
                patronymic=data.get("patronymic"),
                login=login,
                password_hash=pw_hash,
            )
        teachers.append(teacher)

    # Assign teachers to subjects + classes (class_id is NOT NULL in teacher_subjects).
    for idx, (teacher, subject) in enumerate(zip(teachers, subjects[: len(teachers)])):
        cls = classes[idx % len(classes)]
        exists = (
            session.query(TeacherSubject)
            .filter(
                TeacherSubject.school_id == school.id,
                TeacherSubject.teacher_id == teacher.id,
                TeacherSubject.subject_id == subject.id,
                TeacherSubject.class_id == cls.id,
            )
            .first()
        )
        if exists is None:
            session.add(
                TeacherSubject(
                    school_id=school.id,
                    teacher_id=teacher.id,
                    subject_id=subject.id,
                    class_id=cls.id,
                )
            )
        # Назначаем классному руководителю первый класс, если ещё не назначен.
        if cls.teacher_id is None:
            cls.teacher_id = teacher.id

    return teachers


def seed_schedule(session: Session, school: School, classes: list[Class], subjects: list[Subject], teachers: list[User]) -> None:
    """Create a weekly schedule: each class has 4 lessons per day Mon-Fri."""
    if session.query(Schedule).filter(Schedule.school_id == school.id).first():
        return

    # Teachers are assigned to subjects in seed_teachers in the same order.
    teacher_by_subject = {subjects[i].id: teachers[i % len(teachers)].id for i in range(len(subjects))}

    for cls in classes:
        for day in range(5):  # Monday-Friday
            for lesson_num in range(1, 5):
                idx = (day + lesson_num + cls.id) % len(subjects)
                subject = subjects[idx]
                session.add(Schedule(
                    school_id=school.id,
                    class_id=cls.id,
                    subject_id=subject.id,
                    teacher_id=teacher_by_subject.get(subject.id, teachers[0].id),
                    day_of_week=day,
                    lesson_number=lesson_num,
                    room=f"{101 + (cls.id % 10)}",
                ))


def seed_students(session: Session, school: School, classes: list[Class]) -> tuple[list[User], dict[int, list[User]]]:
    students: list[User] = []
    students_by_class: dict[int, list[User]] = {cls.id: [] for cls in classes}
    student_index = 1
    for cls in classes:
        # 10-15 students per class
        count = random.randint(10, 15)
        for _ in range(count):
            # Первый ученик — точное совпадение с презентацией для инвестора.
            if student_index == 1:
                first, last, patronymic = "Михаил", "Литвин", "Павлович"
                login = "stu_1_jnlk"
                pw_hash = hash_password("EE4zfPDwEK")
            else:
                if random.choice([True, False]):
                    first = random.choice(FIRST_NAMES_M)
                    last = random.choice(LAST_NAMES_M)
                    patronymic = None
                else:
                    first = random.choice(FIRST_NAMES_F)
                    last = random.choice(LAST_NAMES_F)
                    patronymic = None
                login = f"student{student_index}"
                pw_hash = None
            student = _make_user(
                session,
                "student",
                school.id,
                first,
                last,
                login,
                patronymic=patronymic,
                login=login,
                password_hash=pw_hash,
            )
            session.add(ClassStudent(class_id=cls.id, student_id=student.id))
            students.append(student)
            students_by_class[cls.id].append(student)
            student_index += 1
    return students, students_by_class


def seed_grades(session: Session, school: School, classes: list[Class], students_by_class: dict[int, list[User]], subjects: list[Subject], work_types: list[WorkType]) -> None:
    if session.query(Grade).filter(Grade.school_id == school.id).first():
        return

    start_date = datetime.now() - timedelta(days=60)
    end_date = datetime.now()

    for cls in classes:
        class_students = students_by_class.get(cls.id, [])
        if not class_students:
            continue
        for subject in subjects:
            for _ in range(random.randint(3, 6)):
                student = random.choice(class_students)
                work_type = random.choice(work_types)
                grade_value = random.randint(3, 5)
                grade = Grade(
                    school_id=school.id,
                    student_id=student.id,
                    class_id=cls.id,
                    subject_id=subject.id,
                    work_type_id=work_type.id,
                    grade_value=grade_value,
                    weight=work_type.weight,
                    value=grade_value * 10,
                    lesson_date=_random_date(start_date, end_date),
                )
                session.add(grade)


def seed_transactions(session: Session, school: School, students: list[User]) -> None:
    if session.query(Transaction).filter(Transaction.school_id == school.id).first():
        return

    for student in random.sample(students, min(10, len(students))):
        amount = random.randint(10, 50)
        txn = Transaction(
            school_id=school.id,
            user_id=student.id,
            amount=amount,
            balance_after=student.balance + amount,
            type="reward",
            reason="Активность на уроке",
        )
        session.add(txn)
        student.balance += amount


def seed_shop_items(session: Session, school: School) -> list[ShopItem]:
    items_data = [
        {"name": "Фирменный стикерпак", "price": 50, "item_type": "sticker", "rarity": "common"},
        {"name": "Пропуск опоздания", "price": 120, "item_type": "pass", "rarity": "rare"},
        {"name": "Бонусный балл", "price": 200, "item_type": "boost", "rarity": "epic"},
        {"name": "Фирменная ручка", "price": 80, "item_type": "merch", "rarity": "common", "is_physical": True},
        {"name": "Экскурсия в IT-компанию", "price": 500, "item_type": "event", "rarity": "legendary"},
    ]
    items = []
    for data in items_data:
        item = session.query(ShopItem).filter(ShopItem.school_id == school.id, ShopItem.name == data["name"]).first()
        if item is None:
            item = ShopItem(
                school_id=school.id,
                name=data["name"],
                price=data["price"],
                item_type=data["item_type"],
                rarity=data["rarity"],
                is_physical=data.get("is_physical", False),
                is_active=True,
            )
            session.add(item)
            session.flush()
        items.append(item)
    return items


def main() -> None:
    settings = get_settings()
    database_url = settings.async_database_url.replace("+asyncpg", "")
    engine = create_engine(database_url)
    Base.metadata.create_all(engine)

    SessionLocal = sessionmaker(bind=engine)
    with SessionLocal() as session:
        org, school = seed_org_and_school(session)
        seed_admin(session, org)
        subjects = seed_subjects(session, school)
        work_types = seed_work_types(session, school)
        bell = seed_bell_schedule(session, school)
        classes = seed_classes(session, school, bell)
        teachers = seed_teachers(session, school, subjects, classes)
        seed_schedule(session, school, classes, subjects, teachers)
        students, students_by_class = seed_students(session, school, classes)
        seed_grades(session, school, classes, students_by_class, subjects, work_types)
        seed_transactions(session, school, students)
        seed_shop_items(session, school)
        session.commit()
        print(f"Seeded school '{school.name}' (id={school.id}) with {len(students)} students, {len(teachers)} teachers, {len(subjects)} subjects.")


if __name__ == "__main__":
    main()
