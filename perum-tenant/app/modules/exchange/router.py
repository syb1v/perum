"""Exchange endpoints, mounted at /api/exchange (legacy-compatible paths).

Reads (market-data/history/portfolio/logs) open to any authenticated user;
invest/cancel are student-only; calculate-results is teacher/admin (the engine
that prices the week and settles investments).
"""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import get_current_user, require_admin, require_student, require_teacher
from app.models import ExchangeLog, ExchangeSettings, Investment, Subject, TradingWindow, User
from app.modules.exchange import service
from app.modules.school_admin.service import resolve_school_id

router = APIRouter()


class InvestRequest(BaseModel):
    subject_id: int
    amount: int


async def _school(user: User, db: AsyncSession) -> int:
    return await resolve_school_id(user, db)


@router.get("/market-data")
async def market_data(
    week_number: int | None = None,
    academic_year: int | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    return await service.get_market_data(db, await _school(user, db), user, week_number, academic_year)


@router.get("/history/{subject_id}")
async def history(
    subject_id: int,
    limit: int = 14,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    return await service.get_history(db, await _school(user, db), user, subject_id, limit)


@router.get("/portfolio")
async def portfolio(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> dict:
    return await service.get_portfolio(db, await _school(user, db), user)


@router.get("/logs")
async def logs(
    limit: int = Query(50, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list:
    return await service.get_logs(db, user, limit)


@router.post("/invest")
async def invest(
    payload: InvestRequest,
    week_number: int | None = None,
    academic_year: int | None = None,
    user: User = Depends(require_student),
    db: AsyncSession = Depends(get_db),
) -> dict:
    return await service.invest(
        db, await _school(user, db), user, payload.subject_id, payload.amount, week_number, academic_year
    )


@router.delete("/investments/{investment_id}")
async def cancel(
    investment_id: int, user: User = Depends(require_student), db: AsyncSession = Depends(get_db)
) -> dict:
    return await service.cancel_investment(db, await _school(user, db), user, investment_id)


@router.post("/calculate-results")
async def calculate_results(
    week_number: int | None = None,
    academic_year: int | None = None,
    user: User = Depends(require_teacher),
    db: AsyncSession = Depends(get_db),
) -> dict:
    return await service.calculate_results(db, await _school(user, db), week_number, academic_year, user.id)


# ============================================================================
# Admin-биржа (school_admin/director): настройки, окна торгов, вклады, логи.
# Закрывает «ExchangeManagement.tsx звал несуществующий бэкенд» (AUDIT 2.9).
# ============================================================================


class SettingsPayload(BaseModel):
    open_day: int = 1
    open_time: str = "00:00"
    close_day: int = 7
    close_time: str = "23:59"
    calc_day: int = 7
    calc_time: str = "20:30"


class TogglePayload(BaseModel):
    is_active: bool


def _user_brief(u: User | None) -> dict:
    if u is None:
        return {"id": None, "login": "—", "first_name": None, "last_name": None}
    return {"id": u.id, "login": u.login, "first_name": u.first_name, "last_name": u.last_name}


@router.get("/admin/settings")
async def admin_get_settings(user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)) -> dict:
    school_id = await _school(user, db)
    s = (await db.execute(select(ExchangeSettings).where(ExchangeSettings.school_id == school_id))).scalar_one_or_none()
    if s is None:
        s = ExchangeSettings(school_id=school_id)
        db.add(s)
        await db.commit()
        await db.refresh(s)
    return {
        "open_day": s.open_day, "open_time": s.open_time,
        "close_day": s.close_day, "close_time": s.close_time,
        "calc_day": s.calc_day, "calc_time": s.calc_time,
    }


@router.put("/admin/settings")
async def admin_put_settings(payload: SettingsPayload, user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)) -> dict:
    school_id = await _school(user, db)
    s = (await db.execute(select(ExchangeSettings).where(ExchangeSettings.school_id == school_id))).scalar_one_or_none()
    if s is None:
        s = ExchangeSettings(school_id=school_id)
        db.add(s)
    s.open_day, s.open_time = payload.open_day, payload.open_time
    s.close_day, s.close_time = payload.close_day, payload.close_time
    s.calc_day, s.calc_time = payload.calc_day, payload.calc_time
    s.updated_at = datetime.utcnow()
    await db.commit()
    return {"status": "ok"}


@router.get("/admin/windows")
async def admin_windows(user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)) -> list[dict]:
    school_id = await _school(user, db)
    rows = (await db.execute(
        select(TradingWindow).where(TradingWindow.school_id == school_id).order_by(TradingWindow.id.desc())
    )).scalars().all()
    return [{
        "id": w.id, "week_number": w.week_number, "academic_year": w.academic_year,
        "opens_at": w.opens_at.isoformat() if w.opens_at else None,
        "closes_at": w.closes_at.isoformat() if w.closes_at else None,
        "is_active": w.is_active,
        "created_at": w.created_at.isoformat() if w.created_at else None,
    } for w in rows]


@router.post("/admin/windows/{window_id}/toggle")
async def admin_toggle_window(window_id: int, payload: TogglePayload, user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)) -> dict:
    school_id = await _school(user, db)
    w = await db.get(TradingWindow, window_id)
    if w is None or w.school_id != school_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "окно не найдено")
    w.is_active = payload.is_active
    await db.commit()
    return {"status": "ok", "is_active": w.is_active}


@router.get("/admin/investments")
async def admin_investments(limit: int = Query(20, ge=1, le=200), user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)) -> list[dict]:
    school_id = await _school(user, db)
    rows = (await db.execute(
        select(Investment, User, Subject)
        .join(User, Investment.user_id == User.id, isouter=True)
        .join(Subject, Investment.subject_id == Subject.id, isouter=True)
        .where(Investment.school_id == school_id)
        .order_by(Investment.id.desc()).limit(limit)
    )).all()
    return [{
        "id": inv.id, "user": _user_brief(u), "subject": (subj.name if subj else "—"),
        "amount": inv.amount, "status": inv.status,
        "result_amount": inv.result_amount, "index_change": inv.index_change,
        "created_at": inv.created_at.isoformat() if inv.created_at else None,
    } for inv, u, subj in rows]


async def _refund_investment(inv: Investment, db: AsyncSession) -> int:
    """Вернуть активный вклад: статус cancelled, вернуть amount на баланс ученика,
    записать лог. Возвращает 1 если возврат выполнен, иначе 0."""
    if inv.status != "active":
        return 0
    inv.status = "cancelled"
    inv.completed_at = datetime.utcnow()
    student = await db.get(User, inv.user_id)
    if student is not None:
        student.balance = (student.balance or 0) + inv.amount
    db.add(ExchangeLog(
        school_id=inv.school_id, user_id=inv.user_id, subject_id=inv.subject_id,
        action="cancel", amount=inv.amount, price=None,
    ))
    return 1


@router.post("/admin/investments/refund-all")
async def admin_refund_all(user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)) -> dict:
    school_id = await _school(user, db)
    rows = (await db.execute(
        select(Investment).where(Investment.school_id == school_id, Investment.status == "active")
    )).scalars().all()
    count = 0
    for inv in rows:
        count += await _refund_investment(inv, db)
    await db.commit()
    return {"refunded_count": count, "message": f"Возвращено вкладов: {count}"}


@router.post("/admin/investments/{investment_id}/refund")
async def admin_refund_one(investment_id: int, user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)) -> dict:
    school_id = await _school(user, db)
    inv = await db.get(Investment, investment_id)
    if inv is None or inv.school_id != school_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "вклад не найден")
    refunded = await _refund_investment(inv, db)
    await db.commit()
    return {"status": "ok", "refunded": refunded}


@router.get("/admin/logs")
async def admin_logs(limit: int = Query(50, ge=1, le=200), user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)) -> list[dict]:
    school_id = await _school(user, db)
    rows = (await db.execute(
        select(ExchangeLog, User)
        .join(User, ExchangeLog.user_id == User.id, isouter=True)
        .where(ExchangeLog.school_id == school_id)
        .order_by(ExchangeLog.id.desc()).limit(limit)
    )).all()
    return [{
        "id": lg.id, "user": _user_brief(u), "action": lg.action,
        "amount": lg.amount, "price": lg.price,
        "created_at": lg.created_at.isoformat() if lg.created_at else None,
    } for lg, u in rows]
