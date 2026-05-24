"""Monthly subject leaderboard (Phase 7), ported from the legacy leaderboard
router.

Per subject, per month-season: top-10 students by weighted-free average mark,
tie-broken by positive (4–5) count then total count. Scope follows the legacy
rule — grades 1–9 compete across the whole parallel (same grade level) within
the school, grades 10–11 only within their (profile) class. The first 5 days of
the current month are a "forming" grace period. All reads are school-scoped.
"""

from __future__ import annotations

from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy import and_, case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Subject, User
from app.models.academic import Class, ClassStudent
from app.models.journal import Grade

MIN_GRADES_FOR_RATING = 1
GRACE_PERIOD_DAYS = 5
MONTH_NAMES = {
    1: "Январь", 2: "Февраль", 3: "Март", 4: "Апрель", 5: "Май", 6: "Июнь",
    7: "Июль", 8: "Август", 9: "Сентябрь", 10: "Октябрь", 11: "Ноябрь", 12: "Декабрь",
}
BADGES = {1: "gold", 2: "silver", 3: "bronze"}


def _season(month: int | None, year: int | None) -> tuple[datetime, datetime, str, bool]:
    now = datetime.now()
    if not month or not (1 <= month <= 12):
        month = now.month
    if not year or not (2000 <= year <= 2100):
        year = now.year
    start = datetime(year, month, 1)
    end = datetime(year + 1, 1, 1) if month == 12 else datetime(year, month + 1, 1)
    name = f"{MONTH_NAMES[month]} {year}"
    forming = (month == now.month and year == now.year) and now.day <= GRACE_PERIOD_DAYS
    return start, end, name, forming


async def _user_class(db: AsyncSession, school_id: int, user_id: int) -> Class | None:
    return (
        await db.execute(
            select(Class)
            .join(ClassStudent, ClassStudent.class_id == Class.id)
            .where(ClassStudent.student_id == user_id, Class.school_id == school_id)
        )
    ).scalar_one_or_none()


async def _scope_class_ids(db: AsyncSession, school_id: int, cls: Class) -> tuple[list[int], str]:
    grade = cls.grade_level or 0
    if grade >= 10:
        return [cls.id], cls.name
    # grades 1–9: whole parallel within the school
    ids = (
        await db.execute(
            select(Class.id).where(Class.school_id == school_id, Class.grade_level == grade)
        )
    ).scalars().all()
    return list(ids), f"Параллель {grade}"


def _empty(subject: Subject, season: str, scope: str, forming: bool = False, msg: str | None = None) -> dict:
    return {
        "subject": {"id": subject.id, "name": subject.name},
        "leaderboard": [],
        "current_user_entry": None,
        "season": season,
        "scope": scope,
        "forming": forming,
        "forming_message": msg,
    }


async def get_leaderboard(
    db: AsyncSession, school_id: int, user: User, subject_id: int, month: int | None, year: int | None
) -> dict:
    subject = (
        await db.execute(select(Subject).where(Subject.id == subject_id, Subject.school_id == school_id))
    ).scalar_one_or_none()
    if subject is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Предмет не найден")

    start, end, season, forming = _season(month, year)
    if forming:
        return _empty(
            subject, season, "Рейтинг формируется", forming=True,
            msg=f"Рейтинг начнёт отображаться {GRACE_PERIOD_DAYS + 1}-го числа. Сейчас идёт накопление оценок.",
        )

    cls = await _user_class(db, school_id, user.id)
    if cls is None:
        return _empty(subject, season, "Нет класса")
    scope_ids, scope_name = await _scope_class_ids(db, school_id, cls)
    if not scope_ids:
        return _empty(subject, season, scope_name)

    # Per-student stats over the season window, subject and scope.
    stats = (
        select(
            Grade.student_id.label("sid"),
            func.avg(Grade.grade_value).label("avg"),
            func.count(case((Grade.grade_value >= 4, Grade.id), else_=None)).label("pos"),
            func.count(Grade.id).label("cnt"),
        )
        .where(
            and_(
                Grade.subject_id == subject_id,
                Grade.school_id == school_id,
                Grade.grade_value.isnot(None),
                Grade.lesson_date >= start,
                Grade.lesson_date < end,
                Grade.class_id.in_(scope_ids),
            )
        )
        .group_by(Grade.student_id)
        .having(func.count(Grade.id) >= MIN_GRADES_FOR_RATING)
        .subquery()
    )

    # Class-name map for the scope (for display).
    name_rows = (
        await db.execute(
            select(ClassStudent.student_id, Class.name)
            .join(Class, Class.id == ClassStudent.class_id)
            .where(ClassStudent.class_id.in_(scope_ids))
        )
    ).all()
    class_name_of = {sid: name for sid, name in name_rows}

    rows = (
        await db.execute(
            select(User, stats.c.avg, stats.c.pos, stats.c.cnt)
            .join(stats, User.id == stats.c.sid)
            .where(User.role == "student")
            .order_by(stats.c.avg.desc(), stats.c.pos.desc(), stats.c.cnt.desc())
            .limit(10)
        )
    ).all()

    def _entry(rank: int, student: User, avg, pos, cnt) -> dict:
        return {
            "rank": rank,
            "student": {
                "id": student.id,
                "first_name": student.first_name,
                "last_name": student.last_name,
                "login": student.login,
                "class_name": class_name_of.get(student.id),
                "avatar_url": student.avatar_url,
            },
            "avg": round(float(avg or 0), 2),
            "positive_count": int(pos or 0),
            "grades_count": int(cnt or 0),
            "badge": BADGES.get(rank),
            "is_current_user": student.id == user.id,
        }

    leaderboard = [_entry(i, s, avg, pos, cnt) for i, (s, avg, pos, cnt) in enumerate(rows, start=1)]
    in_top = any(e["is_current_user"] for e in leaderboard)

    current_user_entry = None
    if not in_top and user.role == "student":
        mine = (
            await db.execute(
                select(stats.c.avg, stats.c.pos, stats.c.cnt).where(stats.c.sid == user.id)
            )
        ).first()
        if mine is not None:
            avg, pos, cnt = mine
            higher = (
                await db.scalar(
                    select(func.count()).select_from(stats).where(
                        (stats.c.avg > avg)
                        | ((stats.c.avg == avg) & (stats.c.pos > pos))
                        | ((stats.c.avg == avg) & (stats.c.pos == pos) & (stats.c.cnt > cnt))
                    )
                )
            ) or 0
            current_user_entry = _entry(int(higher) + 1, user, avg, pos, cnt)

    return {
        "subject": {"id": subject.id, "name": subject.name},
        "leaderboard": leaderboard,
        "current_user_entry": current_user_entry,
        "season": season,
        "scope": scope_name,
        "forming": False,
        "forming_message": None,
    }
