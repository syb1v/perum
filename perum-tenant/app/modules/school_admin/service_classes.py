"""Classes: CRUD, students, schedule (view + editing with subgroups)."""

from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User
from app.models.academic import (
    Class,
    ClassStudent,
    LessonGroup,
    LessonGroupStudent,
    Schedule,
    Subject,
    TeacherSubject,
)
from app.modules.school_admin.schemas import ClassCreate, ClassUpdate


def user_name(u: User | None) -> str | None:
    if u is None:
        return None
    full = f"{u.last_name or ''} {u.first_name or ''}".strip()
    return full or u.login


def _norm_id(v: int | None) -> int | None:
    return v if v else None  # treat 0 / None / "" as "no value"


async def list_classes(db: AsyncSession, school_id: int) -> list[dict]:
    classes = (
        await db.execute(
            select(Class).where(Class.school_id == school_id).order_by(Class.grade_level, Class.name)
        )
    ).scalars().all()
    out = []
    for c in classes:
        teacher = await db.get(User, c.teacher_id) if c.teacher_id else None
        count = await db.scalar(
            select(func.count()).select_from(ClassStudent).where(ClassStudent.class_id == c.id)
        )
        out.append(
            {
                "id": c.id,
                "name": c.name,
                "teacher": {"id": teacher.id, "name": user_name(teacher)} if teacher else None,
                "student_count": int(count or 0),
                "bell_schedule_id": c.bell_schedule_id,
                "grade_level": c.grade_level,
                "is_profile": c.is_profile,
                "parent_id": None,
                "created_at": c.created_at.isoformat() if c.created_at else None,
            }
        )
    return out


async def get_class(db: AsyncSession, school_id: int, class_id: int) -> Class:
    c = (
        await db.execute(select(Class).where(Class.id == class_id, Class.school_id == school_id))
    ).scalar_one_or_none()
    if c is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Класс не найден")
    return c


async def create_class(db: AsyncSession, school_id: int, data: ClassCreate) -> Class:
    c = Class(
        school_id=school_id,
        name=data.name,
        grade_level=data.grade_level,
        is_profile=data.is_profile,
        teacher_id=_norm_id(data.teacher_id),
        bell_schedule_id=_norm_id(data.bell_schedule_id),
    )
    db.add(c)
    await db.commit()
    await db.refresh(c)
    return c


async def update_class(db: AsyncSession, school_id: int, class_id: int, data: ClassUpdate) -> Class:
    c = await get_class(db, school_id, class_id)
    c.name = data.name
    c.grade_level = data.grade_level
    c.is_profile = data.is_profile
    c.teacher_id = _norm_id(data.teacher_id)
    c.bell_schedule_id = _norm_id(data.bell_schedule_id)
    await db.commit()
    return c


async def delete_class(db: AsyncSession, school_id: int, class_id: int) -> None:
    c = await get_class(db, school_id, class_id)
    await db.delete(c)
    await db.commit()


async def get_class_students(db: AsyncSession, school_id: int, class_id: int) -> dict:
    c = await get_class(db, school_id, class_id)
    rows = (
        await db.execute(
            select(User, ClassStudent.id)
            .join(ClassStudent, ClassStudent.student_id == User.id)
            .where(ClassStudent.class_id == class_id)
            .order_by(User.last_name, User.first_name)
        )
    ).all()
    students = [
        {
            "id": u.id,
            "login": u.login,
            "first_name": u.first_name,
            "last_name": u.last_name,
            "balance": u.balance,
            "membership_id": membership_id,
        }
        for (u, membership_id) in rows
    ]
    return {"class": {"id": c.id, "name": c.name}, "students": students}


async def add_student(db: AsyncSession, school_id: int, class_id: int, student_id: int) -> None:
    await get_class(db, school_id, class_id)
    exists = (
        await db.execute(
            select(ClassStudent).where(
                ClassStudent.class_id == class_id, ClassStudent.student_id == student_id
            )
        )
    ).scalar_one_or_none()
    if exists is None:
        db.add(ClassStudent(class_id=class_id, student_id=student_id))
        await db.commit()


async def remove_student(db: AsyncSession, school_id: int, class_id: int, student_id: int) -> None:
    await get_class(db, school_id, class_id)
    cs = (
        await db.execute(
            select(ClassStudent).where(
                ClassStudent.class_id == class_id, ClassStudent.student_id == student_id
            )
        )
    ).scalar_one_or_none()
    if cs is not None:
        await db.delete(cs)
        await db.commit()


async def get_class_schedule(db: AsyncSession, school_id: int, class_id: int) -> dict:
    c = await get_class(db, school_id, class_id)
    rows = (
        await db.execute(
            select(Schedule)
            .where(Schedule.class_id == class_id)
            .order_by(Schedule.day_of_week, Schedule.lesson_number)
        )
    ).scalars().all()
    # Подгруппы класса по слотам (день, урок).
    group_rows = (
        await db.execute(select(LessonGroup).where(LessonGroup.class_id == class_id))
    ).scalars().all()
    groups_by_slot: dict[tuple[int, int], list[dict]] = {}
    for g in group_rows:
        sids = (
            await db.execute(select(LessonGroupStudent.student_id).where(LessonGroupStudent.group_id == g.id))
        ).scalars().all()
        groups_by_slot.setdefault((g.day_of_week, g.lesson_number), []).append({
            "id": g.id,
            "name": g.name,
            "room": g.room_name,
            "teacher_id": g.teacher_id,
            "student_ids": list(sids),
        })

    schedule = []
    for s in rows:
        subject = await db.get(Subject, s.subject_id)
        teacher = await db.get(User, s.teacher_id) if s.teacher_id else None
        schedule.append(
            {
                "id": s.id,
                "day_of_week": s.day_of_week,
                "lesson_number": s.lesson_number,
                "subject": {"id": subject.id, "name": subject.name, "short_name": subject.short_name}
                if subject
                else None,
                "subject_id": s.subject_id,
                "teacher": {"id": teacher.id, "name": user_name(teacher)} if teacher else None,
                "teacher_id": s.teacher_id,
                "room": s.room,
                "groups": groups_by_slot.get((s.day_of_week, s.lesson_number), []),
            }
        )
    return {"class": {"id": c.id, "name": c.name}, "schedule": schedule}


async def update_class_schedule(db: AsyncSession, school_id: int, class_id: int, items: list[dict]) -> dict:
    """Полная замена расписания класса (+ подгруппы). Авто-создаёт назначения
    учителей подгрупп. Возвращает предупреждения (не блокируют сохранение)."""
    c = await get_class(db, school_id, class_id)

    # Валидация + внутренние конфликты слот/учитель/кабинет.
    slots: set = set()
    teachers: set = set()
    rooms: set = set()
    for it in items:
        d, ln = int(it["day_of_week"]), int(it["lesson_number"])
        if not (0 <= d <= 5):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "День недели от 0 (Пн) до 5 (Сб)")
        if not (1 <= ln <= 8):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Номер урока от 1 до 8")
        if (d, ln) in slots:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Два урока на одно время: День {d}, Урок {ln}")
        slots.add((d, ln))
        tid = it.get("teacher_id")
        if tid:
            if (d, ln, tid) in teachers:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Учитель на 2 урока сразу: День {d}, Урок {ln}")
            teachers.add((d, ln, tid))
        room = (str(it.get("room")).strip() if it.get("room") else None)
        if room:
            if (d, ln, room) in rooms:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Кабинет {room} занят дважды: День {d}, Урок {ln}")
            rooms.add((d, ln, room))

    # Полная замена: чистим старое расписание + подгруппы класса.
    await db.execute(delete(Schedule).where(Schedule.class_id == class_id))
    old_groups = (await db.execute(select(LessonGroup.id).where(LessonGroup.class_id == class_id))).scalars().all()
    if old_groups:
        await db.execute(delete(LessonGroupStudent).where(LessonGroupStudent.group_id.in_(old_groups)))
        await db.execute(delete(LessonGroup).where(LessonGroup.class_id == class_id))

    warnings: list[str] = []
    class_student_ids = set(
        (await db.execute(select(ClassStudent.student_id).where(ClassStudent.class_id == class_id))).scalars().all()
    )

    for it in items:
        subject_id = it["subject_id"]
        if not await db.scalar(select(Subject.id).where(Subject.id == subject_id, Subject.school_id == school_id)):
            raise HTTPException(status.HTTP_404_NOT_FOUND, f"Предмет {subject_id} не найден")
        d, ln = int(it["day_of_week"]), int(it["lesson_number"])
        db.add(Schedule(
            school_id=school_id, class_id=class_id, subject_id=subject_id,
            teacher_id=it.get("teacher_id"), day_of_week=d, lesson_number=ln, room=it.get("room"),
        ))

        groups = it.get("groups") or []
        if groups:
            assigned: set = set()
            for g in groups:
                grp = LessonGroup(
                    school_id=school_id, class_id=class_id, day_of_week=d, lesson_number=ln,
                    name=g["name"], room_name=g.get("room"), teacher_id=g.get("teacher_id"),
                )
                db.add(grp)
                await db.flush()
                g_teacher = g.get("teacher_id")
                if g_teacher:
                    exists = await db.scalar(select(TeacherSubject.id).where(
                        TeacherSubject.teacher_id == g_teacher, TeacherSubject.class_id == class_id,
                        TeacherSubject.subject_id == subject_id,
                    ))
                    if not exists:
                        db.add(TeacherSubject(school_id=school_id, teacher_id=g_teacher, class_id=class_id, subject_id=subject_id))
                else:
                    warnings.append(f"День {d}, урок {ln}: подгруппа «{g['name']}» без учителя")
                for sid in (g.get("student_ids") or []):
                    db.add(LessonGroupStudent(group_id=grp.id, student_id=sid))
                    assigned.add(sid)
            unassigned = class_student_ids - assigned
            if unassigned:
                warnings.append(f"День {d}, урок {ln}: {len(unassigned)} учеников не распределены в подгруппы")

    await db.commit()
    return {"success": True, "message": f"Расписание обновлено ({len(items)} уроков)", "warnings": warnings}
