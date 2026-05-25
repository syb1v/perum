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


class OrgAdmin(Base):
    """Администратор организации — оператор УЗЛА ОРГ (control-plane уровня).
    Провижинит школы своей орг и обновляет их по кнопке; внутрь школ не заходит.
    Скоуплен `org_id`. Логинится в портал орг (v2, см. docs/ARCH_ORG_NODE.md)."""

    __tablename__ = "org_admins"
    __table_args__ = (UniqueConstraint("login", name="uq_org_admins_login"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    org_id: Mapped[int] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    login: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class Organization(Base):
    """A tenant org. Owns 1..N schools, each provisioned into its own stack."""

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
    secret: Mapped["OrganizationSecret | None"] = relationship(
        back_populates="organization",
        cascade="all, delete-orphan",
        uselist=False,
    )
    schools: Mapped[list["School"]] = relationship(
        back_populates="organization",
        cascade="all, delete-orphan",
    )


class OrganizationSecret(Base):
    """Per-org generated secrets, consumed when provisioning its stack.

    Phase 1: stored in plaintext in the control DB. KMS/Vault encryption is a
    Phase 9 hardening item (see docs/PROVISIONING.md step 3). Kept separate from
    `organizations` so the org listing API never returns these by accident.
    """

    __tablename__ = "organization_secrets"

    org_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("organizations.id", ondelete="CASCADE"),
        primary_key=True,
    )
    db_password: Mapped[str] = mapped_column(String(128), nullable=False)
    secret_key: Mapped[str] = mapped_column(String(128), nullable=False)
    telemetry_token: Mapped[str] = mapped_column(String(128), nullable=False)
    redis_db_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)

    organization: Mapped[Organization] = relationship(back_populates="secret")


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


# ============================================================================
# Архитектура v2 («узел организации»): силовой юнит = ШКОЛА. School — ребёнок
# Organization, провижинится в собственный стек (контейнер+БД+volume). См.
# docs/ARCH_ORG_NODE.md. Зеркалит Organization-провижининг, но уровнем ниже.
# ============================================================================


class School(Base):
    """Школа внутри организации. Провижинится в свой стек `school_<slug>_*`."""

    __tablename__ = "schools"
    __table_args__ = (UniqueConstraint("slug", name="uq_schools_slug"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    org_id: Mapped[int] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    slug: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)

    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="provisioning", server_default="provisioning"
    )
    # Тег релиза, на котором сейчас крутится стек школы (для OTA-обновлений).
    release_tag: Mapped[str | None] = mapped_column(String(64), nullable=True)

    admin_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    activated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    organization: Mapped[Organization] = relationship(back_populates="schools")
    secret: Mapped["SchoolSecret | None"] = relationship(
        back_populates="school", cascade="all, delete-orphan", uselist=False
    )
    domains: Mapped[list["SchoolDomain"]] = relationship(
        back_populates="school", cascade="all, delete-orphan"
    )


class SchoolSecret(Base):
    """Секреты стека школы (плейнтекст; KMS — позже). Зеркало OrganizationSecret."""

    __tablename__ = "school_secrets"

    school_id: Mapped[int] = mapped_column(
        ForeignKey("schools.id", ondelete="CASCADE"), primary_key=True
    )
    db_password: Mapped[str] = mapped_column(String(128), nullable=False)
    secret_key: Mapped[str] = mapped_column(String(128), nullable=False)
    telemetry_token: Mapped[str] = mapped_column(String(128), nullable=False)
    redis_db_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)

    school: Mapped[School] = relationship(back_populates="secret")


class SchoolDomain(Base):
    """Hostname, маршрутизируемый на стек школы (поддомен или кастомный)."""

    __tablename__ = "school_domains"
    __table_args__ = (UniqueConstraint("domain", name="uq_school_domains_domain"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    school_id: Mapped[int] = mapped_column(
        ForeignKey("schools.id", ondelete="CASCADE"), nullable=False, index=True
    )
    domain: Mapped[str] = mapped_column(String(255), nullable=False)
    domain_type: Mapped[str] = mapped_column(String(20), nullable=False, comment="subdomain | custom")
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="pending_dns", server_default="pending_dns"
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    activated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    school: Mapped[School] = relationship(back_populates="domains")


class Release(Base):
    """Канал релизов: версия образа стека школы + changelog. Узлы орг сравнивают
    свой `release_tag` с текущим релизом и обновляются по кнопке (OTA)."""

    __tablename__ = "releases"
    __table_args__ = (UniqueConstraint("channel", "version_tag", name="uq_release_channel_version"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    channel: Mapped[str] = mapped_column(String(30), nullable=False, default="stable", server_default="stable")
    version_tag: Mapped[str] = mapped_column(String(64), nullable=False)
    image: Mapped[str | None] = mapped_column(String(255), nullable=True)
    changelog: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_current: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    published_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    published_by: Mapped[int | None] = mapped_column(
        ForeignKey("platform_admins.id", ondelete="SET NULL"), nullable=True
    )
