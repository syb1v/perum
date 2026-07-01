"""Analytics logic (Phase 8) — ported from legacy analytics.py + admin_analytics.py.

Two audiences:
- Teacher: per-class dashboard (KPI, успеваемость по дням, проблемные темы,
  ученики «на внимание»), темы, работы, проблемные ученики. Доступ — только к
  своим классам (классрук или назначение teacher_subjects).
- School admin: экономика платформы (deep-economy) и успеваемость по школе
  (performance). Плюс приём page-visit'ов от фронтового трекера.

Всё school-scoped: оценки по `Grade.school_id`, транзакции по `Transaction.school_id`.
Средний балл — взвешенный: sum(grade_value*weight)/sum(weight) (как в легаси).
"""

from __future__ import annotations

from datetime import datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import Integer, and_, case, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Class,
    Grade,
    ShopItem,
    Subject,
    Topic,
    Transaction,
    User,
    UserInventory,
    WorkType,
)
from app.models.analytics import PageVisit
from app.models.journal import ControlWork, Homework

_MONTHS = {
    "january": 1, "february": 2, "march": 3, "april": 4,
    "may": 5, "june": 6, "july": 7, "august": 8,
    "september": 9, "october": 10, "november": 11, "december": 12,
}

# Взвешенный средний балл — общий для всех агрегатов учителя.
_WEIGHTED_AVG = func.sum(Grade.grade_value * Grade.weight) / func.sum(Grade.weight)


def parse_period(period: str | None) -> tuple[datetime, datetime]:
    """Парсит период: 'YYYY-MM-DD,YYYY-MM-DD' (с фронта), 'month-month', 'YYYY-MM'.

    По умолчанию — последние 30 дней.
    """
    now = datetime.now()
    if not period:
        return now - timedelta(days=30), now

    parts = period.lower().split("-")
    if len(parts) == 2 and parts[0] in _MONTHS and parts[1] in _MONTHS:
        year = now.year
        start = datetime(year, _MONTHS[parts[0]], 1)
        end_month = _MONTHS[parts[1]]
        if end_month == 12:
            end = datetime(year + 1, 1, 1) - timedelta(seconds=1)
        else:
            end = datetime(year, end_month + 1, 1) - timedelta(seconds=1)
        return start, end

    try:
        if "," in period:
            start_str, end_str = period.split(",")
            start = datetime.strptime(start_str.strip(), "%Y-%m-%d")
            end = datetime.strptime(end_str.strip(), "%Y-%m-%d") + timedelta(days=1, seconds=-1)
            return start, end
    except (ValueError, TypeError):
        pass

    try:
        ym = period.split("-")
        if len(ym) == 2:
            year, month = int(ym[0]), int(ym[1])
            start = datetime(year, month, 1)
            if month == 12:
                end = datetime(year + 1, 1, 1) - timedelta(seconds=1)
            else:
                end = datetime(year, month + 1, 1) - timedelta(seconds=1)
            return start, end
    except (ValueError, TypeError):
        pass

    return now - timedelta(days=30), now


# ---- Teacher: access + filters -----------------------------------------

async def get_accessible_class(db: AsyncSession, class_id: int, teacher: User, school_id: int) -> Class:
    """Класс доступен учителю как классруку либо при наличии назначения (teacher_subjects)."""
    from app.models.academic import TeacherSubject

    class_ = await db.scalar(
        select(Class).where(Class.id == class_id, Class.school_id == school_id)
    )
    if not class_:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Нет доступа к этому классу или класс не найден")
    if class_.teacher_id == teacher.id:
        return class_
    has_assignment = await db.scalar(
        select(TeacherSubject.id).where(
            TeacherSubject.teacher_id == teacher.id, TeacherSubject.class_id == class_id
        )
    )
    if not has_assignment:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Нет доступа к этому классу или класс не найден")
    return class_


def _grade_filter(class_id: int, school_id: int, start: datetime, end: datetime, subject_id: int | None):
    cond = and_(
        Grade.school_id == school_id,
        Grade.class_id == class_id,
        Grade.created_at >= start,
        Grade.created_at <= end,
    )
    if subject_id:
        cond = and_(cond, Grade.subject_id == subject_id)
    return cond


# ---- Teacher: aggregates -------------------------------------------------

async def _dashboard_kpi(db: AsyncSession, gf) -> dict:
    avg_grade, total = (
        await db.execute(select(_WEIGHTED_AVG, func.count(Grade.id)).where(gf, Grade.grade_value.isnot(None)))
    ).one()
    bad = await db.scalar(select(func.count(Grade.id)).where(gf, Grade.grade_value.in_([2, 3]))) or 0
    return {
        "avg_grade": round(float(avg_grade), 2) if avg_grade else 0,
        "total_grades": int(total or 0),
        "bad_grades": int(bad),
    }


async def _dynamics(db: AsyncSession, gf) -> list[dict]:
    day = func.date(func.coalesce(Grade.lesson_date, Grade.created_at))
    rows = (
        await db.execute(
            select(day.label("date"), _WEIGHTED_AVG.label("avg"))
            .where(gf, Grade.grade_value.isnot(None))
            .group_by(day)
            .order_by(day)
        )
    ).all()
    return [{"date": str(r.date), "avg": round(float(r.avg), 2)} for r in rows]


async def _problem_topics(db: AsyncSession, gf, limit: int = 5) -> list[dict]:
    rows = (
        await db.execute(
            select(
                Topic.id,
                Topic.name,
                _WEIGHTED_AVG.label("avg"),
                func.count(Grade.id).label("total_count"),
                func.sum(case((Grade.grade_value <= 3, 1), else_=0)).label("bad_count"),
            )
            .join(Grade, Grade.topic_id == Topic.id)
            .where(gf, Grade.grade_value.isnot(None))
            .group_by(Topic.id, Topic.name)
            .having(_WEIGHTED_AVG < 3.5)
            .order_by(_WEIGHTED_AVG)
            .limit(limit)
        )
    ).all()
    return [
        {
            "id": r.id,
            "name": r.name,
            "avg": round(float(r.avg), 2),
            "bad_count": int(r.bad_count),
            "total_count": int(r.total_count),
            "bad_ratio": f"{int(r.bad_count)}/{int(r.total_count)}",
        }
        for r in rows
    ]


async def _attention_students(db: AsyncSession, gf, limit: int = 5) -> list[dict]:
    twos = func.sum(case((Grade.grade_value == 2, 1), else_=0))
    rows = (
        await db.execute(
            select(User.id, User.first_name, User.last_name, _WEIGHTED_AVG.label("avg"), twos.label("twos"))
            .join(Grade, Grade.student_id == User.id)
            .where(gf, Grade.grade_value.isnot(None))
            .group_by(User.id, User.first_name, User.last_name)
            .having((_WEIGHTED_AVG < 3.5) | (twos >= 3))
            .order_by(_WEIGHTED_AVG)
            .limit(limit)
        )
    ).all()
    return [
        {
            "id": r.id,
            "name": f"{r.last_name or ''} {(r.first_name or ' ')[0]}.".strip(),
            "avg": round(float(r.avg), 2),
            "twos": int(r.twos),
        }
        for r in rows
    ]


async def dashboard(db: AsyncSession, school_id: int, teacher: User, class_id: int, subject_id: int | None, period: str | None) -> dict:
    class_ = await get_accessible_class(db, class_id, teacher, school_id)
    start, end = parse_period(period)
    gf = _grade_filter(class_id, school_id, start, end, subject_id)

    kpi = await _dashboard_kpi(db, gf)
    dynamics = await _dynamics(db, gf)
    problem_topics = await _problem_topics(db, gf)
    attention = await _attention_students(db, gf)

    total = kpi["total_grades"]
    return {
        "class_id": class_id,
        "class_name": class_.name,
        "period": {"start": start.isoformat(), "end": end.isoformat()},
        "kpi": {
            "avg_grade": kpi["avg_grade"],
            "total_grades": total,
            "bad_grades": kpi["bad_grades"],
            "bad_ratio": f"{kpi['bad_grades']}/{total}" if total else "0/0",
            "problem_topics_count": len(problem_topics),
        },
        "dynamics": dynamics,
        "problem_topics": problem_topics,
        "attention_students": attention,
    }


async def topics(db: AsyncSession, school_id: int, teacher: User, class_id: int, subject_id: int | None, period: str | None) -> dict:
    await get_accessible_class(db, class_id, teacher, school_id)
    start, end = parse_period(period)
    gf = _grade_filter(class_id, school_id, start, end, subject_id)
    class_avg = await db.scalar(select(_WEIGHTED_AVG).where(gf, Grade.grade_value.isnot(None)))
    topics_gf = and_(gf, Grade.topic_id.isnot(None))
    return {
        "class_avg": round(float(class_avg), 2) if class_avg else 0.0,
        "topics": await _problem_topics(db, topics_gf),
    }


async def works(db: AsyncSession, school_id: int, teacher: User, class_id: int, subject_id: int | None, period: str | None) -> dict:
    await get_accessible_class(db, class_id, teacher, school_id)
    start, end = parse_period(period)
    gf = and_(_grade_filter(class_id, school_id, start, end, subject_id), Grade.work_type_id.isnot(None))
    day = func.date(func.coalesce(Grade.lesson_date, Grade.created_at))
    rows = (
        await db.execute(
            select(
                day.label("date"),
                WorkType.name.label("work_type_name"),
                Topic.name.label("topic_name"),
                _WEIGHTED_AVG.label("avg"),
                func.count(Grade.id).label("total_count"),
                func.sum(case((Grade.grade_value <= 3, 1), else_=0)).label("bad_count"),
            )
            .outerjoin(Topic, Grade.topic_id == Topic.id)
            .outerjoin(WorkType, Grade.work_type_id == WorkType.id)
            .where(gf, Grade.grade_value.isnot(None))
            .group_by(day, WorkType.name, Topic.name)
            .order_by(desc(day))
        )
    ).all()
    return {
        "works": [
            {
                "date": str(r.date),
                "type": r.work_type_name or "Урок",
                "topic": r.topic_name,
                "avg": round(float(r.avg), 2),
                "bad_count": int(r.bad_count),
                "total_count": int(r.total_count),
                "bad_ratio": f"{int(r.bad_count)}/{int(r.total_count)}",
            }
            for r in rows
        ]
    }


async def problem_students(db: AsyncSession, school_id: int, teacher: User, class_id: int, subject_id: int | None, period: str | None) -> dict:
    await get_accessible_class(db, class_id, teacher, school_id)
    start, end = parse_period(period)
    gf = _grade_filter(class_id, school_id, start, end, subject_id)
    twos = func.sum(case((Grade.grade_value == 2, 1), else_=0))
    threes = func.sum(case((Grade.grade_value == 3, 1), else_=0))
    rows = (
        await db.execute(
            select(
                User.id, User.first_name, User.last_name,
                _WEIGHTED_AVG.label("avg"), func.count(Grade.id).label("total"),
                twos.label("twos"), threes.label("threes"),
            )
            .join(Grade, Grade.student_id == User.id)
            .where(gf, Grade.grade_value.isnot(None))
            .group_by(User.id, User.first_name, User.last_name)
            .order_by(_WEIGHTED_AVG)
        )
    ).all()

    students = []
    for r in rows:
        avg = float(r.avg)
        n_twos, n_threes = int(r.twos), int(r.threes)
        issues = []
        if avg < 3.5:
            issues.append("Низкий средний балл")
        if n_twos >= 3:
            issues.append(f"{n_twos} двоек")
        if n_threes >= 5:
            issues.append(f"{n_threes} троек")
        students.append({
            "id": r.id,
            "name": f"{r.last_name or ''} {r.first_name or ''}".strip(),
            "avg": round(avg, 2),
            "total_grades": int(r.total),
            "twos": n_twos,
            "threes": n_threes,
            "is_problem": len(issues) > 0,
            "issues": issues,
        })
    students.sort(key=lambda s: (not s["is_problem"], s["avg"]))
    return {"students": students, "problem_count": sum(1 for s in students if s["is_problem"])}


# ---- Admin: page-visit tracking -----------------------------------------

async def track_visit(db: AsyncSession, user: User | None, path: str, referrer: str | None, user_agent: str | None, is_mobile: bool) -> dict:
    session_id = f"user_{user.id}" if user else "anonymous"
    db.add(PageVisit(
        school_id=user.school_id if user else None,
        session_identifier=session_id,
        user_id=user.id if user else None,
        path=path,
        referrer=referrer,
        user_agent=user_agent,
        is_mobile=is_mobile,
    ))
    await db.commit()
    return {"success": True}


# ---- Admin: deep economy -------------------------------------------------

# Все известные типы транзакций; знак суммы решает доход/расход.
_TX_TYPES = [
    "grade", "grade_correction", "grade_deleted", "quest",
    "purchase", "exchange_invest", "exchange_cancel", "exchange_result",
]


async def deep_economy(db: AsyncSession, school_id: int, period_days: int) -> dict:
    period_start = datetime.now() - timedelta(days=period_days)
    base = and_(Transaction.school_id == school_id, Transaction.created_at >= period_start)

    total_distributed = await db.scalar(
        select(func.sum(Transaction.amount)).where(base, Transaction.amount > 0)
    ) or 0
    total_spent = await db.scalar(
        select(func.sum(Transaction.amount)).where(base, Transaction.amount < 0)
    ) or 0

    income_rows = (
        await db.execute(
            select(Transaction.type, func.sum(Transaction.amount))
            .where(base, Transaction.amount > 0).group_by(Transaction.type)
        )
    ).all()
    income_sources = [{"source": t, "amount": int(a)} for t, a in income_rows]

    expense_rows = (
        await db.execute(
            select(Transaction.type, func.sum(Transaction.amount))
            .where(base, Transaction.amount < 0).group_by(Transaction.type)
        )
    ).all()
    expense_sources = [{"source": t, "amount": int(abs(a))} for t, a in expense_rows]

    # Дневной график доход/расход.
    daily: dict[str, dict[str, int]] = {}
    for i in range(period_days + 1):
        key = (period_start + timedelta(days=i)).strftime("%d.%m")
        daily[key] = {"income": 0, "expense": 0}
    all_tx = (
        await db.execute(select(Transaction.created_at, Transaction.amount).where(base))
    ).all()
    for dt, amount in all_tx:
        key = dt.strftime("%d.%m")
        if key in daily:
            if amount > 0:
                daily[key]["income"] += amount
            elif amount < 0:
                daily[key]["expense"] += abs(amount)
    daily_stats = [{"date": k, "income": v["income"], "expense": v["expense"]} for k, v in daily.items()]

    recent_rows = (
        await db.execute(
            select(Transaction, User)
            .join(User, Transaction.user_id == User.id)
            .where(Transaction.school_id == school_id)
            .order_by(Transaction.created_at.desc())
            .limit(20)
        )
    ).all()
    recent = [
        {
            "id": t.id,
            "user_login": u.login,
            "user_name": f"{u.first_name or ''} {u.last_name or ''}".strip() or u.login,
            "amount": t.amount,
            "type": t.type,
            "description": t.reason or "",
            "created_at": t.created_at.isoformat(),
        }
        for t, u in recent_rows
    ]

    # Доход/расход по классам (через состав классов).
    from app.models.academic import ClassStudent

    income_case = case((Transaction.amount > 0, Transaction.amount), else_=0)
    expense_case = case((Transaction.amount < 0, func.abs(Transaction.amount)), else_=0)
    class_rows = (
        await db.execute(
            select(
                Class.id, Class.name,
                func.sum(income_case).label("income"),
                func.sum(expense_case).label("expense"),
            )
            .join(ClassStudent, Class.id == ClassStudent.class_id)
            .join(Transaction, Transaction.user_id == ClassStudent.student_id)
            .where(Class.school_id == school_id, Transaction.created_at >= period_start)
            .group_by(Class.id, Class.name)
        )
    ).all()
    class_stats = [
        {"class_id": r.id, "class_name": r.name, "income": int(r.income or 0), "expense": int(r.expense or 0)}
        for r in class_rows
        if (r.income or 0) > 0 or (r.expense or 0) > 0
    ]

    # Маркет: разбивка трат по категориям/товарам (purchase → inventory → item).
    abs_amt = func.sum(func.abs(Transaction.amount))
    cat_rows = (
        await db.execute(
            select(ShopItem.item_type, abs_amt.label("amount"))
            .join(UserInventory, Transaction.related_id == UserInventory.id)
            .join(ShopItem, UserInventory.item_id == ShopItem.id)
            .where(Transaction.type == "purchase", Transaction.created_at >= period_start, ShopItem.school_id == school_id)
            .group_by(ShopItem.item_type)
        )
    ).all()
    market_categories = [{"category": r.item_type, "amount": int(r.amount or 0)} for r in cat_rows]

    item_rows = (
        await db.execute(
            select(ShopItem.id, ShopItem.name, abs_amt.label("amount"))
            .join(UserInventory, Transaction.related_id == UserInventory.id)
            .join(ShopItem, UserInventory.item_id == ShopItem.id)
            .where(Transaction.type == "purchase", Transaction.created_at >= period_start, ShopItem.school_id == school_id)
            .group_by(ShopItem.id, ShopItem.name)
            .order_by(abs_amt.desc())
            .limit(10)
        )
    ).all()
    market_items = [{"item_id": r.id, "item_name": r.name, "amount": int(r.amount or 0)} for r in item_rows]

    return {
        "success": True,
        "total_distributed": int(total_distributed),
        "total_spent": int(abs(total_spent)),
        "daily_stats": daily_stats,
        "income_sources": income_sources,
        "expense_sources": expense_sources,
        "recent_large_transactions": recent,
        "class_stats": class_stats,
        "market_categories": market_categories,
        "market_items": market_items,
    }


# ---- Admin: school-wide performance --------------------------------------

async def performance(db: AsyncSession, school_id: int, period_days: int) -> dict:
    period_start = datetime.now() - timedelta(days=period_days)
    eff_date = func.coalesce(Grade.lesson_date, Grade.created_at)
    base = and_(Grade.school_id == school_id, Grade.grade_value.isnot(None), eff_date >= period_start)

    avg_grade = await db.scalar(select(func.avg(Grade.grade_value)).where(base)) or 0.0
    total_grades = await db.scalar(select(func.count(Grade.id)).where(base)) or 0

    dist_rows = (
        await db.execute(
            select(Grade.grade_value, func.count(Grade.id)).where(base).group_by(Grade.grade_value)
        )
    ).all()
    grade_distribution = [{"grade_value": int(g), "count": int(c)} for g, c in dist_rows]

    grade_rows = (await db.execute(select(eff_date, Grade.grade_value).where(base))).all()
    daily: dict[str, list[int]] = {}
    for i in range(period_days + 1):
        daily[(period_start + timedelta(days=i)).strftime("%d.%m")] = [0, 0]
    for dt, val in grade_rows:
        key = dt.strftime("%d.%m")
        if key in daily:
            daily[key][0] += val
            daily[key][1] += 1
    daily_stats = [
        {"date": k, "avg_grade": round(v[0] / v[1], 2) if v[1] else 0} for k, v in daily.items()
    ]

    subj_rows = (
        await db.execute(
            select(Subject.name, func.avg(Grade.grade_value).label("avg"))
            .join(Subject, Grade.subject_id == Subject.id)
            .where(base)
            .group_by(Subject.name)
        )
    ).all()
    all_subjects = [{"subject_name": s, "avg_grade": round(float(a), 2)} for s, a in subj_rows if a is not None]
    all_subjects.sort(key=lambda x: x["avg_grade"], reverse=True)

    return {
        "success": True,
        "average_school_grade": round(float(avg_grade), 2),
        "total_grades_given": int(total_grades),
        "daily_stats": daily_stats,
        "grade_distribution": grade_distribution,
        "top_subjects": all_subjects[:5],
        "bottom_subjects": list(reversed(all_subjects[-5:])) if len(all_subjects) > 5 else list(reversed(all_subjects)),
    }
