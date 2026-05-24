"""Exchange (биржа ливок) models (Phase 7).

Subjects behave like tradeable stocks: SubjectAverage holds a per-class,
per-week price index (the week's average mark) and its % change vs the prior
week. Students invest livki during an open TradingWindow; when results are
calculated the investment pays out amount × (1 + index_change/100). ExchangeLog
records actions. All school-scoped.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class SubjectAverage(Base):
    __tablename__ = "subject_averages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    school_id: Mapped[int | None] = mapped_column(
        ForeignKey("schools.id", ondelete="CASCADE"), nullable=True, index=True
    )
    class_id: Mapped[int] = mapped_column(ForeignKey("classes.id", ondelete="CASCADE"), nullable=False, index=True)
    subject_id: Mapped[int] = mapped_column(ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False, index=True)
    week_number: Mapped[int] = mapped_column(Integer, nullable=False)
    academic_year: Mapped[int] = mapped_column(Integer, nullable=False)
    average_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    index_change: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)  # % vs prior week
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)


class Investment(Base):
    __tablename__ = "investments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    school_id: Mapped[int | None] = mapped_column(
        ForeignKey("schools.id", ondelete="CASCADE"), nullable=True, index=True
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    subject_id: Mapped[int] = mapped_column(ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False, index=True)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    week_number: Mapped[int] = mapped_column(Integer, nullable=False)
    academic_year: Mapped[int] = mapped_column(Integer, nullable=False)
    result_amount: Mapped[int | None] = mapped_column(Integer, nullable=True)
    index_change: Mapped[float | None] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class TradingWindow(Base):
    __tablename__ = "trading_windows"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    school_id: Mapped[int | None] = mapped_column(
        ForeignKey("schools.id", ondelete="CASCADE"), nullable=True, index=True
    )
    week_number: Mapped[int] = mapped_column(Integer, nullable=False)
    academic_year: Mapped[int] = mapped_column(Integer, nullable=False)
    opens_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    closes_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)


class ExchangeSettings(Base):
    __tablename__ = "exchange_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    school_id: Mapped[int | None] = mapped_column(
        ForeignKey("schools.id", ondelete="CASCADE"), nullable=True, index=True
    )
    open_day: Mapped[int] = mapped_column(Integer, nullable=False, default=1)  # 1=Mon..7=Sun
    open_time: Mapped[str] = mapped_column(String(5), nullable=False, default="00:00")
    close_day: Mapped[int] = mapped_column(Integer, nullable=False, default=7)
    close_time: Mapped[str] = mapped_column(String(5), nullable=False, default="23:59")
    calc_day: Mapped[int] = mapped_column(Integer, nullable=False, default=7)
    calc_time: Mapped[str] = mapped_column(String(5), nullable=False, default="20:30")
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)


class ExchangeLog(Base):
    __tablename__ = "exchange_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    school_id: Mapped[int | None] = mapped_column(
        ForeignKey("schools.id", ondelete="CASCADE"), nullable=True, index=True
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    subject_id: Mapped[int] = mapped_column(ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False, index=True)
    action: Mapped[str] = mapped_column(String(50), nullable=False)  # invest, cancel, dividend
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    price: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
