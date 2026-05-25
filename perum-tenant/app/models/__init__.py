"""Tenant-side models (live in org_<slug>_db).

Phase 2 adds the identity core: Organization (one meta row mirroring the
control-plane org), School (1..N per org), User (org/school members). Every
school-scoped table from Phase 5+ will carry `school_id NOT NULL`; org-level
users (org_admin) have `school_id = NULL`.

The full domain (academic, journal, market, exchange, quests, …) is ported from
the legacy monolith in later phases — see docs/PLAN.md.
"""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


class TenantMeta(Base):
    """Generic key/value for stack-local metadata (provisioned_at, version, …)."""

    __tablename__ = "tenant_meta"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[str] = mapped_column(String(255), nullable=False)


class Organization(Base):
    """Single meta row for this stack; `slug` mirrors ORG_SLUG."""

    __tablename__ = "organizations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    slug: Mapped[str] = mapped_column(String(40), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)

    schools: Mapped[list["School"]] = relationship(
        back_populates="organization", cascade="all, delete-orphan"
    )


class School(Base):
    """A school inside the org. Created by org_admin after onboarding."""

    __tablename__ = "schools"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    org_id: Mapped[int] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)

    organization: Mapped[Organization] = relationship(back_populates="schools")
    users: Mapped[list["User"]] = relationship(back_populates="school")


class User(Base):
    """Org/school member. `school_id` is NULL for org-level roles (org_admin)."""

    __tablename__ = "users"
    __table_args__ = (UniqueConstraint("login", name="uq_users_login"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    school_id: Mapped[int | None] = mapped_column(
        ForeignKey("schools.id", ondelete="CASCADE"), nullable=True, index=True
    )
    role: Mapped[str] = mapped_column(String(30), nullable=False)
    login: Mapped[str] = mapped_column(String(150), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    first_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    last_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    patronymic: Mapped[str | None] = mapped_column(String(100), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Гамификация (ливки) — наполнится в Фазе 7; здесь чтобы фронт-шапка читала баланс.
    balance: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    avatar_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    school: Mapped[School | None] = relationship(back_populates="users")


# Academic-core models (Phase 5) — registered on Base.metadata for migrations.
from app.models.academic import (  # noqa: E402,F401
    AcademicYear,
    BellSchedule,
    BellScheduleItem,
    Class,
    ClassStudent,
    LessonGroup,
    LessonGroupStudent,
    Schedule,
    SchoolPeriod,
    Subject,
    TeacherSubject,
    Topic,
    WorkType,
)

# Journal / grades models (Phase 6).
from app.models.journal import (  # noqa: E402,F401
    ControlWork,
    FinalGrade,
    Grade,
    Homework,
    HomeworkAttachment,
    Transaction,
)

# Parent ↔ student link (Phase 6).
from app.models.parent import ParentStudent  # noqa: E402,F401

# Market models (Phase 7).
from app.models.market import ShopItem, UserInventory  # noqa: E402,F401

# Quest models (Phase 7).
from app.models.quests import Quest, UserQuest  # noqa: E402,F401

# Exchange models (Phase 7).
from app.models.exchange import (  # noqa: E402,F401
    ExchangeLog,
    ExchangeSettings,
    Investment,
    SubjectAverage,
    TradingWindow,
)

# News models (Phase 8).
from app.models.news import News, NewsLike, NewsRead  # noqa: E402,F401

# Analytics models (Phase 8).
from app.models.analytics import PageVisit  # noqa: E402,F401

# Appeals model (Phase 8).
from app.models.appeals import GradeAppeal  # noqa: E402,F401
