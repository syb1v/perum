"""Student cabinet logic (Phase 6), ported from the legacy schedule router.

Read-only views for the logged-in student: weekly diary (schedule + grades +
homework + control works), the flat grade list, per-period analytics, final
grades and a grade summary. All queries are scoped to the student's school and
to the student's own id — a student can only ever read their own data.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Subject, User
from app.models.academic import (
    BellScheduleItem,
    Class,
    ClassStudent,
    LessonGroup,
    LessonGroupStudent,
    Schedule,
    WorkType,
)
from app.models.journal import ControlWork, FinalGrade, Grade, Homework, HomeworkAttachment
from app.modules.journal.service import _list_periods
from app.services.points_calculator import grade_color

DAY_NAMES = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"]


# ---- shared helpers ----
async def _student_class(db: AsyncSession, school_id: int, student_id: int) -> Class | None:
    return (
        await db.execute(
            select(Class)
            .join(ClassStudent, ClassStudent.class_id == Class.id)
            .where(ClassStudent.student_id == student_id, Class.school_id == school_id)
        )
    ).scalar_one_or_none()


async def _work_type_names(db: AsyncSession, school_id: int) -> dict[int, str]:
    rows = (await db.execute(select(WorkType).where(WorkType.school_id == school_id))).scalars().all()
    return {w.id: w.name for w in rows}


def _as_date(value):
    return value.date() if isinstance(value, datetime) else value


# ---- diary ----
async def get_diary(db: AsyncSession, school_id: int, user: User, week_offset: int = 0) -> dict:
    cls = await _student_class(db, school_id, user.id)
    if cls is None:
        return {"class_id": None, "class_name": None, "diary": {}}

    today = datetime.now().date()
    week_start = today - timedelta(days=today.weekday()) + timedelta(weeks=week_offset)
    week_end = week_start + timedelta(days=6)
    week_start_dt = datetime(week_start.year, week_start.month, week_start.day)
    week_end_dt = datetime(week_end.year, week_end.month, week_end.day, 23, 59, 59)

    # Schedule + bell schedule
    schedule = (
        await db.execute(select(Schedule).where(Schedule.class_id == cls.id, Schedule.school_id == school_id))
    ).scalars().all()
    bell_items: list[BellScheduleItem] = []
    if cls.bell_schedule_id:
        bell_items = (
            await db.execute(
                select(BellScheduleItem).where(BellScheduleItem.bell_schedule_id == cls.bell_schedule_id)
            )
        ).scalars().all()

    # Subgroups: which room / group name applies to this student per (day, lesson)
    group_rows = (
        await db.execute(
            select(LessonGroup, LessonGroupStudent)
            .outerjoin(
                LessonGroupStudent,
                (LessonGroupStudent.group_id == LessonGroup.id)
                & (LessonGroupStudent.student_id == user.id),
            )
            .where(LessonGroup.class_id == cls.id, LessonGroup.school_id == school_id)
        )
    ).all()
    group_info: dict[tuple[int, int], dict] = {}
    for group, link in group_rows:
        key = (group.day_of_week, group.lesson_number)
        info = group_info.setdefault(key, {"all_rooms": [], "student_room": None, "student_group_name": None})
        if group.room_name and group.room_name not in info["all_rooms"]:
            info["all_rooms"].append(group.room_name)
        if link is not None:
            info["student_room"] = group.room_name
            info["student_group_name"] = group.name

    # Grades for the week, grouped by (subject_id, YYYY-MM-DD)
    grades = (
        await db.execute(
            select(Grade).where(
                Grade.student_id == user.id,
                Grade.school_id == school_id,
                Grade.lesson_date >= week_start_dt,
                Grade.lesson_date <= week_end_dt,
            )
        )
    ).scalars().all()
    wt_names = await _work_type_names(db, school_id)
    grades_map: dict[tuple[int, str], list[dict]] = {}
    for g in grades:
        date_str = g.lesson_date.strftime("%Y-%m-%d") if g.lesson_date else None
        grades_map.setdefault((g.subject_id, date_str), []).append(
            {
                "id": g.id,
                "value": g.grade_value,
                "points": g.value,
                "weight": g.weight,
                "type": wt_names.get(g.work_type_id, "ответ"),
                "comment": g.comment,
                "color": grade_color(g.grade_value, g.attendance_mark),
            }
        )

    # Class homework, grouped by subject (+ attachments)
    homework = (
        await db.execute(select(Homework).where(Homework.class_id == cls.id, Homework.school_id == school_id))
    ).scalars().all()
    hw_ids = [h.id for h in homework]
    atts_by_hw: dict[int, list[dict]] = {}
    if hw_ids:
        atts = (
            await db.execute(select(HomeworkAttachment).where(HomeworkAttachment.homework_id.in_(hw_ids)))
        ).scalars().all()
        for a in atts:
            atts_by_hw.setdefault(a.homework_id, []).append(
                {"id": a.id, "filename": a.filename, "url_link": a.url_link}
            )
    homework_map: dict[int, list[dict]] = {}
    for h in homework:
        homework_map.setdefault(h.subject_id, []).append(
            {
                "id": h.id,
                "title": h.title,
                "description": h.description,
                "due_date": h.due_date.isoformat() if h.due_date else None,
                "attachments": atts_by_hw.get(h.id, []),
            }
        )

    # Control works in the week, keyed by (subject_id, date)
    cws = (
        await db.execute(
            select(ControlWork).where(
                ControlWork.class_id == cls.id,
                ControlWork.school_id == school_id,
                ControlWork.work_date >= week_start_dt,
                ControlWork.work_date <= week_end_dt,
            )
        )
    ).scalars().all()
    cw_map: dict[tuple[int, str], dict] = {}
    for cw in cws:
        if cw.work_date:
            cw_map[(cw.subject_id, cw.work_date.strftime("%Y-%m-%d"))] = {
                "id": cw.id,
                "work_type": cw.work_type,
                "title": cw.title,
            }

    # Name maps for subjects / teachers referenced by the schedule
    subj_ids = {s.subject_id for s in schedule}
    teacher_ids = {s.teacher_id for s in schedule if s.teacher_id}
    subjects = (
        {s.id: s for s in (await db.execute(select(Subject).where(Subject.id.in_(subj_ids)))).scalars().all()}
        if subj_ids
        else {}
    )
    teachers = (
        {u.id: u for u in (await db.execute(select(User).where(User.id.in_(teacher_ids)))).scalars().all()}
        if teacher_ids
        else {}
    )

    # Periods overlapping this week (and which one is current)
    periods = await _list_periods(db, school_id)
    week_periods: list[dict] = []
    current_period = None
    for p in periods:
        p_start, p_end = _as_date(p.start_date), _as_date(p.end_date)
        if p_end < week_start or p_start > week_end:
            continue
        is_target = True
        if p.target_grades:
            try:
                targets = json.loads(p.target_grades)
                is_target = cls.grade_level in targets or str(cls.grade_level) in targets
            except Exception:
                is_target = True
        if not is_target:
            continue
        p_data = {
            "id": p.id,
            "name": p.name,
            "period_type": p.period_type,
            "start_date": p.start_date.isoformat(),
            "end_date": p.end_date.isoformat(),
        }
        week_periods.append(p_data)
        if p_start <= today <= p_end:
            current_period = p_data

    diary: dict[int, dict] = {}
    for day in range(6):
        day_date = week_start + timedelta(days=day)
        date_str = day_date.strftime("%Y-%m-%d")
        is_saturday = day == 5
        lessons = []
        for item in sorted(
            (s for s in schedule if s.day_of_week == day), key=lambda s: s.lesson_number
        ):
            bell = next(
                (b for b in bell_items if b.lesson_number == item.lesson_number and bool(b.is_saturday) == is_saturday),
                None,
            )
            if bell is None and is_saturday:
                bell = next(
                    (b for b in bell_items if b.lesson_number == item.lesson_number and not b.is_saturday), None
                )
            subj = subjects.get(item.subject_id)
            teacher = teachers.get(item.teacher_id) if item.teacher_id else None
            room = item.room
            group_name = None
            ginfo = group_info.get((item.day_of_week, item.lesson_number))
            if ginfo:
                if ginfo["student_room"]:
                    room = ginfo["student_room"]
                elif ginfo["all_rooms"]:
                    room = " | ".join(ginfo["all_rooms"])
                group_name = ginfo["student_group_name"] or ("Подгруппы" if ginfo["all_rooms"] else None)
            lesson = {
                "lesson_number": item.lesson_number,
                "subject_id": item.subject_id,
                "subject_name": subj.name if subj else None,
                "teacher_name": (
                    f"{teacher.last_name or ''} {teacher.first_name or ''}".strip() if teacher else None
                ),
                "start_time": bell.start_time if bell else "08:00",
                "end_time": bell.end_time if bell else "08:45",
                "room": room,
                "grades": grades_map.get((item.subject_id, date_str), []),
                "homework": homework_map.get(item.subject_id, []),
                "control_work": cw_map.get((item.subject_id, date_str)),
            }
            if group_name:
                lesson["group_name"] = group_name
            lessons.append(lesson)

        diary[day] = {
            "date": date_str,
            "day_name": DAY_NAMES[day],
            "is_today": day_date == today,
            "lessons": lessons,
        }

    return {
        "class_id": cls.id,
        "class_name": cls.name,
        "week_start": week_start.isoformat(),
        "week_end": week_end.isoformat(),
        "week_offset": week_offset,
        "current_period": current_period,
        "week_periods": week_periods,
        "diary": diary,
    }


# ---- grade lists ----
async def get_grades(db: AsyncSession, school_id: int, user: User, subject_id: int | None = None) -> dict:
    stmt = (
        select(Grade, Subject)
        .join(Subject, Subject.id == Grade.subject_id)
        .where(Grade.student_id == user.id, Grade.school_id == school_id)
        .order_by(Grade.lesson_date.desc())
    )
    if subject_id:
        stmt = stmt.where(Grade.subject_id == subject_id)
    rows = (await db.execute(stmt)).all()
    wt_names = await _work_type_names(db, school_id)
    return {
        "grades": [
            {
                "id": g.id,
                "value": g.grade_value,
                "points": g.value,
                "weight": g.weight,
                "date": g.lesson_date.strftime("%Y-%m-%d") if g.lesson_date else None,
                "type": wt_names.get(g.work_type_id, "ответ"),
                "comment": g.comment,
                "subject_id": subj.id,
                "subject_name": subj.name,
                "color": grade_color(g.grade_value, g.attendance_mark),
            }
            for g, subj in rows
        ]
    }


async def get_summary(db: AsyncSession, school_id: int, user: User) -> dict:
    rows = (
        await db.execute(
            select(Grade, Subject)
            .join(Subject, Subject.id == Grade.subject_id)
            .where(Grade.student_id == user.id, Grade.school_id == school_id)
        )
    ).all()
    by_subj: dict[int, dict] = {}
    total_points = 0
    total_grades = 0
    for g, subj in rows:
        if not g.grade_value:
            continue
        data = by_subj.setdefault(subj.id, {"name": subj.name, "grades": [], "weights": [], "points": 0})
        data["grades"].append(g.grade_value)
        data["weights"].append(g.weight or 1.0)
        data["points"] += g.value or 0
        total_points += g.value or 0
        total_grades += 1
    summary = []
    for subj_id, data in by_subj.items():
        tw = sum(data["weights"])
        avg = round(sum(v * w for v, w in zip(data["grades"], data["weights"])) / tw, 2) if tw else 0
        summary.append(
            {
                "subject_id": subj_id,
                "subject_name": data["name"],
                "average": avg,
                "count": len(data["grades"]),
                "points": data["points"],
            }
        )
    summary.sort(key=lambda x: x["subject_name"])
    return {"subjects": summary, "total_points": total_points, "total_grades": total_grades}


async def get_analytics(db: AsyncSession, school_id: int, user: User) -> dict:
    cls = await _student_class(db, school_id, user.id)
    if cls is None:
        return {"period_type": "quarter", "periods": [], "subjects": []}

    period_type = "half_year" if (cls.grade_level or 1) >= 10 else "quarter"
    periods = [p for p in await _list_periods(db, school_id) if p.period_type == period_type]

    rows = (
        await db.execute(
            select(Grade, Subject)
            .join(Subject, Subject.id == Grade.subject_id)
            .where(Grade.student_id == user.id, Grade.school_id == school_id)
        )
    ).all()

    by_subj: dict[int, dict] = {}
    for g, subj in rows:
        if not g.lesson_date or not g.grade_value:
            continue
        g_date = _as_date(g.lesson_date)
        match = next((p for p in periods if _as_date(p.start_date) <= g_date <= _as_date(p.end_date)), None)
        if match is None:
            continue
        data = by_subj.setdefault(
            subj.id,
            {
                "subject_name": subj.name,
                "periods": {p.id: {"grades": [], "weights": []} for p in periods},
                "all_grades": [],
                "all_weights": [],
            },
        )
        w = g.weight or 1.0
        data["periods"][match.id]["grades"].append(g.grade_value)
        data["periods"][match.id]["weights"].append(w)
        data["all_grades"].append(g.grade_value)
        data["all_weights"].append(w)

    def _wavg(grades, weights):
        tw = sum(weights)
        return round(sum(v * w for v, w in zip(grades, weights)) / tw, 2) if tw else None

    subjects_list = []
    for subj_id, data in by_subj.items():
        if not data["all_grades"]:
            continue
        period_avgs = {
            str(pid): (_wavg(pd["grades"], pd["weights"]) if pd["grades"] else None)
            for pid, pd in data["periods"].items()
        }
        subjects_list.append(
            {
                "subject_id": subj_id,
                "subject_name": data["subject_name"],
                "periods": period_avgs,
                "year_average": _wavg(data["all_grades"], data["all_weights"]),
            }
        )
    subjects_list.sort(key=lambda x: x["subject_name"])

    return {
        "period_type": period_type,
        "periods": [
            {"id": p.id, "name": p.name, "start_date": p.start_date.isoformat(), "end_date": p.end_date.isoformat()}
            for p in periods
        ],
        "subjects": subjects_list,
    }


async def get_finals(db: AsyncSession, school_id: int, user: User) -> dict:
    rows = (
        await db.execute(
            select(FinalGrade, Subject)
            .join(Subject, Subject.id == FinalGrade.subject_id)
            .where(FinalGrade.student_id == user.id, FinalGrade.school_id == school_id)
        )
    ).all()
    periods = {p.id: p for p in await _list_periods(db, school_id)}
    return {
        "final_grades": [
            {
                "id": fg.id,
                "subject_id": fg.subject_id,
                "subject_name": subj.name,
                "period_id": fg.period_id,
                "period_name": periods[fg.period_id].name if fg.period_id in periods else None,
                "grade_value": fg.grade_value,
                "grade_type": fg.grade_type,
                "comment": fg.comment,
                "color": grade_color(fg.grade_value),
            }
            for fg, subj in rows
        ]
    }
