"""Teachers list + teacher↔subject↔class assignments (assign/unassign/bulk sync)
plus per-teacher schedule editing."""

from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.roles import TEACHER
from app.models import User
from app.models.academic import Class, Schedule, Subject, TeacherSubject
from app.modules.school_admin.schemas import TeacherSubjectAssign


def _teacher_name(t: User | None) -> str:
    if not t:
        return ""
    return f"{t.last_name or ''} {t.first_name or ''}".strip() or t.login


async def list_teachers(db: AsyncSession, school_id: int) -> list[dict]:
    teachers = (
        await db.execute(
            select(User)
            .where(User.school_id == school_id, User.role == TEACHER)
            .order_by(User.last_name, User.first_name)
        )
    ).scalars().all()
    out = []
    for t in teachers:
        assigns = (
            await db.execute(select(TeacherSubject).where(TeacherSubject.teacher_id == t.id))
        ).scalars().all()
        a_list = []
        for a in assigns:
            subject = await db.get(Subject, a.subject_id)
            cls = await db.get(Class, a.class_id)
            a_list.append(
                {
                    "id": a.id,
                    "subject": {"id": subject.id, "name": subject.name} if subject else None,
                    "class_val": {"id": cls.id, "name": cls.name} if cls else None,
                }
            )
        out.append(
            {
                "id": t.id,
                "login": t.login,
                "first_name": t.first_name,
                "last_name": t.last_name,
                "patronymic": None,
                "email": t.email,
                "phone": None,
                "assignments": a_list,
            }
        )
    return out


async def assign(db: AsyncSession, school_id: int, data: TeacherSubjectAssign) -> TeacherSubject:
    exists = (
        await db.execute(
            select(TeacherSubject).where(
                TeacherSubject.teacher_id == data.teacher_id,
                TeacherSubject.subject_id == data.subject_id,
                TeacherSubject.class_id == data.class_id,
            )
        )
    ).scalar_one_or_none()
    if exists is not None:
        return exists
    ts = TeacherSubject(
        school_id=school_id,
        teacher_id=data.teacher_id,
        subject_id=data.subject_id,
        class_id=data.class_id,
    )
    db.add(ts)
    await db.commit()
    await db.refresh(ts)
    return ts


async def delete_assignment(db: AsyncSession, school_id: int, assignment_id: int) -> None:
    ts = (
        await db.execute(
            select(TeacherSubject).where(
                TeacherSubject.id == assignment_id, TeacherSubject.school_id == school_id
            )
        )
    ).scalar_one_or_none()
    if ts is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Назначение не найдено")
    await db.delete(ts)
    await db.commit()


async def teachers_by_subject(db: AsyncSession, school_id: int, subject_id: int, class_id: int | None) -> dict:
    stmt = select(TeacherSubject).where(
        TeacherSubject.school_id == school_id, TeacherSubject.subject_id == subject_id
    )
    if class_id:
        stmt = stmt.where(TeacherSubject.class_id == class_id)
    rows = (await db.execute(stmt)).scalars().all()
    teachers, seen = [], set()
    for ts in rows:
        if ts.teacher_id in seen:
            continue
        seen.add(ts.teacher_id)
        t = await db.get(User, ts.teacher_id)
        if t:
            teachers.append({"id": t.id, "name": _teacher_name(t)})
    return {"teachers": teachers}


async def teacher_subjects(db: AsyncSession, school_id: int, teacher_id: int) -> dict:
    teacher = await db.get(User, teacher_id)
    if not teacher or (teacher.school_id is not None and teacher.school_id != school_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Учитель не найден")
    rows = (
        await db.execute(
            select(TeacherSubject).where(
                TeacherSubject.school_id == school_id, TeacherSubject.teacher_id == teacher_id
            )
        )
    ).scalars().all()
    assignments = []
    for ts in rows:
        subj = await db.get(Subject, ts.subject_id)
        c = await db.get(Class, ts.class_id)
        if subj and c:
            assignments.append({
                "id": ts.id,
                "subject": {"id": subj.id, "name": subj.name, "short_name": subj.short_name},
                "class": {"id": c.id, "name": c.name},
            })
    return {"teacher": {"id": teacher.id, "name": _teacher_name(teacher)}, "assignments": assignments}


async def _has_assignment(db: AsyncSession, school_id: int, teacher_id: int, class_id: int, subject_id: int) -> bool:
    return bool(await db.scalar(
        select(TeacherSubject.id).where(
            TeacherSubject.school_id == school_id,
            TeacherSubject.teacher_id == teacher_id,
            TeacherSubject.class_id == class_id,
            TeacherSubject.subject_id == subject_id,
        )
    ))


async def sync_assignments(
    db: AsyncSession, school_id: int, context: str, context_id: int,
    teacher_ids: list[int], subject_ids: list[int], class_ids: list[int],
) -> dict:
    """Пакетная синхронизация назначений по контексту 'subject' или 'teacher'."""
    if context not in ("subject", "teacher"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "context должен быть subject или teacher")

    created = deleted = 0
    target_c = set(class_ids)

    if context == "subject":
        subject_id = context_id
        if not await db.scalar(select(Subject.id).where(Subject.id == subject_id, Subject.school_id == school_id)):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Предмет не найден")
        existing = (
            await db.execute(select(TeacherSubject).where(
                TeacherSubject.school_id == school_id, TeacherSubject.subject_id == subject_id))
        ).scalars().all()
        target_t = set(teacher_ids)
        t_removed, c_removed = {a.teacher_id for a in existing} - target_t, {a.class_id for a in existing} - target_c
        for a in existing:
            if a.teacher_id in t_removed or a.class_id in c_removed:
                await db.delete(a)
                deleted += 1
        for t_id in target_t:
            for c_id in target_c:
                if not await _has_assignment(db, school_id, t_id, c_id, subject_id):
                    db.add(TeacherSubject(school_id=school_id, teacher_id=t_id, subject_id=subject_id, class_id=c_id))
                    created += 1
    else:  # teacher
        teacher_id = context_id
        teacher = await db.get(User, teacher_id)
        if not teacher or (teacher.school_id is not None and teacher.school_id != school_id):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Учитель не найден")
        existing = (
            await db.execute(select(TeacherSubject).where(
                TeacherSubject.school_id == school_id, TeacherSubject.teacher_id == teacher_id))
        ).scalars().all()
        target_s = set(subject_ids)
        s_removed, c_removed = {a.subject_id for a in existing} - target_s, {a.class_id for a in existing} - target_c
        for a in existing:
            if a.subject_id in s_removed or a.class_id in c_removed:
                await db.delete(a)
                deleted += 1
        for s_id in target_s:
            for c_id in target_c:
                if not await _has_assignment(db, school_id, teacher_id, c_id, s_id):
                    db.add(TeacherSubject(school_id=school_id, teacher_id=teacher_id, subject_id=s_id, class_id=c_id))
                    created += 1

    await db.commit()
    return {
        "success": True,
        "message": f"Изменения сохранены (добавлено: {created}, удалено: {deleted})",
        "created_count": created,
        "deleted_count": deleted,
    }


async def get_teacher_schedule(db: AsyncSession, school_id: int, teacher_id: int) -> dict:
    teacher = await db.get(User, teacher_id)
    if not teacher or (teacher.school_id is not None and teacher.school_id != school_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Учитель не найден")
    rows = (
        await db.execute(
            select(Schedule).where(Schedule.school_id == school_id, Schedule.teacher_id == teacher_id)
            .order_by(Schedule.day_of_week, Schedule.lesson_number)
        )
    ).scalars().all()
    days: dict[int, list[dict]] = {d: [] for d in range(6)}
    for s in rows:
        subj = await db.get(Subject, s.subject_id)
        c = await db.get(Class, s.class_id)
        days.setdefault(s.day_of_week, []).append({
            "id": s.id,
            "lesson_number": s.lesson_number,
            "subject_id": s.subject_id,
            "subject_name": subj.name if subj else None,
            "class_id": s.class_id,
            "class_name": c.name if c else None,
            "room": s.room,
        })
    return {"teacher_id": teacher.id, "teacher_name": _teacher_name(teacher), "schedule": days}


async def update_teacher_schedule(db: AsyncSession, school_id: int, teacher_id: int, items: list[dict]) -> dict:
    teacher = await db.get(User, teacher_id)
    if not teacher or teacher.role != TEACHER or (teacher.school_id is not None and teacher.school_id != school_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Учитель не найден")

    slots: set = set()
    for it in items:
        d, ln = int(it["day_of_week"]), int(it["lesson_number"])
        if not (0 <= d <= 5):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "День недели от 0 до 5")
        if not (1 <= ln <= 8):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Урок от 1 до 8")
        if (d, ln) in slots:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Два урока на одно время: День {d}, Урок {ln}")
        slots.add((d, ln))

    await db.execute(delete(Schedule).where(Schedule.school_id == school_id, Schedule.teacher_id == teacher_id))
    for it in items:
        db.add(Schedule(
            school_id=school_id, class_id=it["class_id"], subject_id=it["subject_id"],
            teacher_id=teacher_id, day_of_week=int(it["day_of_week"]),
            lesson_number=int(it["lesson_number"]), room=it.get("room"),
        ))
    await db.commit()
    return {"success": True, "message": f"Расписание учителя обновлено ({len(items)} уроков)"}
