"""Exchange endpoints, mounted at /api/exchange (legacy-compatible paths).

Reads (market-data/history/portfolio/logs) open to any authenticated user;
invest/cancel are student-only; calculate-results is teacher/admin (the engine
that prices the week and settles investments).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import get_current_user, require_student, require_teacher
from app.models import User
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
