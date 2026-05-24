"""SQLAlchemy models for the PERUM control plane.

These tables live in `perum_control_db`. They DO NOT contain any per-school
data (no users-of-schools, no grades, no marketplace items). Their job is to
describe organizations, their domains, deployments and platform-side users.

Per-org tenant data lives in `org_<slug>_db` Postgres instances and is
described by SQLAlchemy models inside `perum-tenant/app/models/`.
"""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


class PlatformAdmin(Base):
    """Operator of the control plane. Logs in at admin.perum.ru."""

    __tablename__ = "platform_admins"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    login: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class Organization(Base):
    """A tenant org. Owns 1..N schools inside its dedicated docker stack."""

    __tablename__ = "organizations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    slug: Mapped[str] = mapped_column(String(40), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)

    status: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="provisioning",
        server_default="provisioning",
    )
    deployment_mode: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="shared_host",
        server_default="shared_host",
    )
    plan: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="trial",
        server_default="trial",
    )

    admin_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    activated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    domains: Mapped[list["OrganizationDomain"]] = relationship(
        back_populates="organization",
        cascade="all, delete-orphan",
    )


class OrganizationDomain(Base):
    """A hostname (subdomain or custom) routed to a specific org stack."""

    __tablename__ = "organization_domains"
    __table_args__ = (UniqueConstraint("domain", name="uq_organization_domains_domain"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    org_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    domain: Mapped[str] = mapped_column(String(255), nullable=False)
    domain_type: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        comment="subdomain | custom",
    )
    status: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="pending_dns",
        server_default="pending_dns",
        comment="pending_dns | active | failed | removed",
    )

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    activated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    organization: Mapped[Organization] = relationship(back_populates="domains")
