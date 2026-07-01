"""Exchange logic (Phase 7), ported from the legacy exchange router/CRUD.

Subjects trade like stocks: SubjectAverage is the weekly price index per class.
Students invest livki during an open TradingWindow (≤500/session); calculate-
results generates the week's averages from grades and settles active investments
at amount × (1 + index_change/100). All school-scoped; investments act on the
caller's own balance.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import and_, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Class,
    ClassStudent,
    ExchangeLog,
    ExchangeSettings,
    Investment,
    Subject,
    SubjectAverage,
    TeacherSubject,
    TradingWindow,
    Transaction,
    User,
)
from app.models.journal import Grade

SESSION_INVEST_LIMIT = 500


def get_current_week_year() -> tuple[int, int]:
    now = datetime.now()
    return now.isocalendar()[1], (now.year if now.month >= 9 else now.year - 1)


def _week_range(week_number: int) -> tuple[datetime, datetime]:
    """Monday 00:00 .. Sunday 23:59:59 of the ISO week (current ISO year)."""
    iso_year = datetime.now().isocalendar()[0]
    jan4 = datetime(iso_year, 1, 4)
    week1_monday = jan4 - timedelta(days=jan4.weekday())
    monday = week1_monday + timedelta(weeks=week_number - 1)
    sunday = monday + timedelta(days=6, hours=23, minutes=59, seconds=59)
    return monday, sunday


async def _student_class_id(db: AsyncSession, school_id: int, user_id: int) -> int | None:
    return await db.scalar(
        select(Class.id)
        .join(ClassStudent, ClassStudent.class_id == Class.id)
        .where(ClassStudent.student_id == user_id, Class.school_id == school_id)
    )


async def _class_subjects(db: AsyncSession, class_id: int) -> list[Subject]:
    return list(
        (
            await db.execute(
                select(Subject)
                .join(TeacherSubject, TeacherSubject.subject_id == Subject.id)
                .where(TeacherSubject.class_id == class_id)
                .distinct()
            )
        ).scalars().all()
    )


async def _get_or_create_window(db: AsyncSession, school_id: int, week: int, year: int) -> TradingWindow:
    win = (
        await db.execute(
            select(TradingWindow).where(
                TradingWindow.school_id == school_id,
                TradingWindow.week_number == week,
                TradingWindow.academic_year == year,
            )
        )
    ).scalar_one_or_none()
    if win is not None:
        now = datetime.now()
        active = win.opens_at <= now < win.closes_at
        if win.is_active != active:
            win.is_active = active
            await db.commit()
        return win

    settings = (
        await db.execute(select(ExchangeSettings).where(ExchangeSettings.school_id == school_id))
    ).scalar_one_or_none()
    open_day = settings.open_day if settings else 1
    open_time = settings.open_time if settings else "00:00"
    close_day = settings.close_day if settings else 7
    close_time = settings.close_time if settings else "23:59"

    now = datetime.now()
    _, current_week, _ = now.isocalendar()
    current_monday = now.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=now.weekday())
    target_monday = current_monday + timedelta(weeks=week - current_week)
    oh, om = map(int, open_time.split(":"))
    ch, cm = map(int, close_time.split(":"))
    opens_at = target_monday + timedelta(days=open_day - 1, hours=oh, minutes=om)
    closes_at = target_monday + timedelta(days=close_day - 1, hours=ch, minutes=cm)

    win = TradingWindow(
        school_id=school_id, week_number=week, academic_year=year,
        opens_at=opens_at, closes_at=closes_at, is_active=(opens_at <= now < closes_at),
    )
    db.add(win)
    await db.commit()
    await db.refresh(win)
    return win


def _subj_brief(s: Subject) -> dict:
    return {"id": s.id, "name": s.name, "category": s.category}


# ---- reads ----
async def get_market_data(db: AsyncSession, school_id: int, user: User, week: int | None, year: int | None) -> dict:
    if not week or not year:
        week, year = get_current_week_year()
    class_id = await _student_class_id(db, school_id, user.id)
    if not class_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ученик не закреплён за классом")

    subjects = await _class_subjects(db, class_id)
    averages = {
        a.subject_id: a
        for a in (
            await db.execute(
                select(SubjectAverage).where(
                    SubjectAverage.class_id == class_id,
                    SubjectAverage.week_number == week,
                    SubjectAverage.academic_year == year,
                )
            )
        ).scalars().all()
    }

    rows = []
    for s in subjects:
        a = averages.get(s.id)
        if a is None:
            last = (
                await db.execute(
                    select(SubjectAverage)
                    .where(SubjectAverage.class_id == class_id, SubjectAverage.subject_id == s.id)
                    .order_by(SubjectAverage.created_at.desc())
                    .limit(1)
                )
            ).scalar_one_or_none()
            rows.append({
                "id": last.id if last else s.id * 10000,
                "class_id": class_id,
                "subject_id": s.id,
                "subject": _subj_brief(s),
                "week_number": week,
                "academic_year": year,
                "average_score": last.average_score if last else 0.0,
                "index_change": last.index_change if last else 0.0,
                "created_at": str(last.created_at) if last and last.created_at else None,
            })
        else:
            rows.append({
                "id": a.id,
                "class_id": a.class_id,
                "subject_id": a.subject_id,
                "subject": _subj_brief(s),
                "week_number": a.week_number,
                "academic_year": a.academic_year,
                "average_score": a.average_score,
                "index_change": a.index_change,
                "created_at": str(a.created_at) if a.created_at else None,
            })

    win = await _get_or_create_window(db, school_id, week, year)
    return {
        "subject_averages": rows,
        "available_subjects": [_subj_brief(s) for s in subjects],
        "current_week": week,
        "academic_year": year,
        "trading_window": {
            "id": win.id, "week_number": win.week_number, "academic_year": win.academic_year,
            "opens_at": str(win.opens_at), "closes_at": str(win.closes_at), "is_active": win.is_active,
        },
    }


async def get_history(db: AsyncSession, school_id: int, user: User, subject_id: int, limit: int) -> dict:
    class_id = await _student_class_id(db, school_id, user.id)
    if not class_id:
        return {"subject_id": subject_id, "history": []}
    rows = (
        await db.execute(
            select(SubjectAverage)
            .where(SubjectAverage.class_id == class_id, SubjectAverage.subject_id == subject_id)
            .order_by(SubjectAverage.week_number)
            .limit(limit)
        )
    ).scalars().all()
    return {
        "subject_id": subject_id,
        "history": [
            {
                "week_number": r.week_number,
                "academic_year": r.academic_year,
                "average_score": r.average_score,
                "index_change": r.index_change,
                "created_at": str(r.created_at) if r.created_at else None,
            }
            for r in rows
        ],
    }


async def get_portfolio(db: AsyncSession, school_id: int, user: User) -> dict:
    rows = (
        await db.execute(
            select(Investment, Subject)
            .join(Subject, Subject.id == Investment.subject_id)
            .where(Investment.user_id == user.id)
            .order_by(Investment.created_at.desc())
        )
    ).all()
    investments = [
        {
            "id": inv.id,
            "subject_id": inv.subject_id,
            "subject_name": subj.name,
            "amount": inv.amount,
            "week_number": inv.week_number,
            "academic_year": inv.academic_year,
            "result_amount": inv.result_amount,
            "index_change": inv.index_change,
            "status": inv.status,
            "created_at": str(inv.created_at) if inv.created_at else None,
            "completed_at": str(inv.completed_at) if inv.completed_at else None,
        }
        for inv, subj in rows
    ]
    active_total = sum(i["amount"] for i in investments if i["status"] == "active")
    return {"investments": investments, "active_total": active_total}


async def get_logs(db: AsyncSession, user: User, limit: int) -> list[dict]:
    rows = (
        await db.execute(
            select(ExchangeLog, Subject)
            .join(Subject, Subject.id == ExchangeLog.subject_id)
            .where(ExchangeLog.user_id == user.id)
            .order_by(ExchangeLog.created_at.desc())
            .limit(limit)
        )
    ).all()
    return [
        {
            "id": log.id, "action": log.action, "amount": log.amount, "price": log.price,
            "created_at": str(log.created_at) if log.created_at else None, "subject": _subj_brief(subj),
        }
        for log, subj in rows
    ]


# ---- trades ----
async def invest(
    db: AsyncSession, school_id: int, user: User, subject_id: int, amount: int, week: int | None, year: int | None
) -> dict:
    if not week or not year:
        week, year = get_current_week_year()
    if amount <= 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Сумма вклада должна быть > 0")
    if amount > (user.balance or 0):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Недостаточно ливок")

    win = await _get_or_create_window(db, school_id, week, year)
    if not win.is_active:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Окно торгов закрыто")

    invested = (
        await db.scalar(
            select(func.coalesce(func.sum(Investment.amount), 0)).where(
                Investment.user_id == user.id,
                Investment.week_number == week,
                Investment.academic_year == year,
                Investment.status == "active",
            )
        )
    ) or 0
    if invested + amount > SESSION_INVEST_LIMIT:
        remaining = max(0, SESSION_INVEST_LIMIT - invested)
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Превышен лимит вкладов (макс. {SESSION_INVEST_LIMIT} за сессию). Доступно ещё: {remaining} ливок.",
        )

    subject = (
        await db.execute(select(Subject).where(Subject.id == subject_id, Subject.school_id == school_id))
    ).scalar_one_or_none()
    if subject is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Предмет не найден")

    inv = Investment(
        school_id=school_id, user_id=user.id, subject_id=subject_id,
        amount=amount, week_number=week, academic_year=year, status="active",
    )
    db.add(inv)
    new_balance = max((user.balance or 0) - amount, 0)
    await db.execute(update(User).where(User.id == user.id).values(balance=new_balance))
    db.add(Transaction(
        school_id=school_id, user_id=user.id, amount=-amount, balance_after=new_balance,
        type="exchange_invest", reason=f"Вклад в {subject.name} (неделя {week})", created_by=user.id,
    ))
    db.add(ExchangeLog(school_id=school_id, user_id=user.id, subject_id=subject_id, action="invest", amount=amount))
    await db.commit()
    await db.refresh(inv)
    return {"status": "ok", "investment_id": inv.id, "amount": amount, "subject": subject.name, "balance_after": new_balance}


async def cancel_investment(db: AsyncSession, school_id: int, user: User, investment_id: int) -> dict:
    inv = (
        await db.execute(
            select(Investment).where(
                Investment.id == investment_id, Investment.user_id == user.id, Investment.status == "active"
            )
        )
    ).scalar_one_or_none()
    if inv is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Вклад не найден или уже завершён")
    inv.status = "cancelled"
    new_balance = (user.balance or 0) + inv.amount
    await db.execute(update(User).where(User.id == user.id).values(balance=new_balance))
    db.add(Transaction(
        school_id=school_id, user_id=user.id, amount=inv.amount, balance_after=new_balance,
        type="exchange_cancel", reason=f"Отмена вклада #{inv.id}", created_by=user.id,
    ))
    db.add(ExchangeLog(school_id=school_id, user_id=user.id, subject_id=inv.subject_id, action="cancel", amount=inv.amount))
    await db.commit()
    return {"status": "ok", "refunded": inv.amount, "balance_after": new_balance}


# ---- engine ----
async def generate_subject_averages(db: AsyncSession, school_id: int, week: int, year: int) -> int:
    monday, sunday = _week_range(week)
    prev_week = week - 1 if week > 1 else 52
    prev_year = year if week > 1 else year - 1
    prev_monday = monday - timedelta(weeks=1)
    prev_sunday = prev_monday + timedelta(days=6, hours=23, minutes=59, seconds=59)

    classes = (await db.execute(select(Class).where(Class.school_id == school_id))).scalars().all()
    generated = 0
    for cls in classes:
        subjects = await _class_subjects(db, cls.id)
        for subj in subjects:
            cur = await db.scalar(
                select(func.avg(Grade.grade_value)).where(and_(
                    Grade.class_id == cls.id, Grade.subject_id == subj.id,
                    Grade.grade_value.isnot(None), Grade.grade_value >= 1,
                    func.coalesce(Grade.lesson_date, Grade.created_at) >= monday,
                    func.coalesce(Grade.lesson_date, Grade.created_at) <= sunday,
                ))
            )
            if cur is None:
                last = (
                    await db.execute(
                        select(SubjectAverage)
                        .where(SubjectAverage.class_id == cls.id, SubjectAverage.subject_id == subj.id)
                        .order_by(SubjectAverage.created_at.desc()).limit(1)
                    )
                ).scalar_one_or_none()
                if last is None:
                    continue
                cur = last.average_score
            cur = round(float(cur), 2)

            prev_rec = (
                await db.execute(
                    select(SubjectAverage).where(and_(
                        SubjectAverage.class_id == cls.id, SubjectAverage.subject_id == subj.id,
                        SubjectAverage.week_number == prev_week, SubjectAverage.academic_year == prev_year,
                    )).limit(1)
                )
            ).scalar_one_or_none()
            if prev_rec is not None:
                prev = prev_rec.average_score
            else:
                prev = await db.scalar(
                    select(func.avg(Grade.grade_value)).where(and_(
                        Grade.class_id == cls.id, Grade.subject_id == subj.id,
                        Grade.grade_value.isnot(None), Grade.grade_value >= 1,
                        func.coalesce(Grade.lesson_date, Grade.created_at) >= prev_monday,
                        func.coalesce(Grade.lesson_date, Grade.created_at) <= prev_sunday,
                    ))
                )
                prev = round(float(prev), 2) if prev else cur

            index_change = round(((cur / prev) - 1) * 100, 2) if prev and prev > 0 else 0.0

            existing = (
                await db.execute(
                    select(SubjectAverage).where(and_(
                        SubjectAverage.class_id == cls.id, SubjectAverage.subject_id == subj.id,
                        SubjectAverage.week_number == week, SubjectAverage.academic_year == year,
                    )).limit(1)
                )
            ).scalar_one_or_none()
            if existing is not None:
                existing.average_score = cur
                existing.index_change = index_change
                existing.created_at = sunday
            else:
                db.add(SubjectAverage(
                    school_id=school_id, class_id=cls.id, subject_id=subj.id,
                    week_number=week, academic_year=year, average_score=cur,
                    index_change=index_change, created_at=sunday,
                ))
            generated += 1
    await db.commit()
    return generated


async def process_week_results(db: AsyncSession, school_id: int, week: int, year: int, teacher_id: int) -> int:
    investments = (
        await db.execute(
            select(Investment).where(Investment.school_id == school_id, Investment.status == "active")
        )
    ).scalars().all()
    processed = 0
    for inv in investments:
        inv_class_id = await _student_class_id(db, school_id, inv.user_id)
        avg = (
            await db.execute(
                select(SubjectAverage).where(and_(
                    SubjectAverage.subject_id == inv.subject_id,
                    SubjectAverage.week_number == week,
                    SubjectAverage.academic_year == year,
                    SubjectAverage.class_id == inv_class_id,
                )).limit(1)
            )
        ).scalar_one_or_none()
        if avg is not None:
            change = avg.index_change / 100
            inv.result_amount = int(inv.amount * (1 + change))
            inv.index_change = avg.index_change
        else:
            inv.result_amount = inv.amount
            inv.index_change = 0.0
        inv.status = "completed"
        inv.completed_at = datetime.now()

        inv_user = await db.get(User, inv.user_id)
        if inv_user is not None:
            new_balance = (inv_user.balance or 0) + inv.result_amount
            inv_user.balance = new_balance
            profit = inv.result_amount - inv.amount
            db.add(Transaction(
                school_id=school_id, user_id=inv.user_id, amount=inv.result_amount, balance_after=new_balance,
                type="exchange_result", reason=f"Результат вклада: {'+' if profit >= 0 else ''}{profit} ливок",
                created_by=teacher_id,
            ))
            db.add(ExchangeLog(
                school_id=school_id, user_id=inv.user_id, subject_id=inv.subject_id,
                action="dividend", amount=inv.result_amount, price=avg.average_score if avg else None,
            ))
        processed += 1
    await db.commit()
    return processed


async def calculate_results(db: AsyncSession, school_id: int, week: int | None, year: int | None, teacher_id: int) -> dict:
    if not week or not year:
        week, year = get_current_week_year()
    generated = await generate_subject_averages(db, school_id, week, year)
    processed = await process_week_results(db, school_id, week, year, teacher_id)
    return {"status": "ok", "generated_averages": generated, "processed": processed, "week_number": week, "academic_year": year}
