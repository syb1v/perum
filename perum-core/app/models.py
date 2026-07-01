"""SQLAlchemy models for the PERUM control plane.

These tables live in `perum_control_db`. They DO NOT contain any per-school
data (no users-of-schools, no grades, no marketplace items). Their job is to
describe organizations, their domains, deployments and platform-side users.

Per-org tenant data lives in `org_<slug>_db` Postgres instances and is
described by SQLAlchemy models inside `perum-tenant/app/models/`.
"""

from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, Enum, Float, ForeignKey, Integer, JSON, String, Text, UniqueConstraint, func

from app.core.crypto import EncryptedString
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
    # Идентичность организации — её ДОМЕН (он же лендинг). slug — внутренний
    # производный токен от домена (имена контейнеров/маршрутов/БД), наружу не виден.
    slug: Mapped[str] = mapped_column(String(40), unique=True, index=True, nullable=False)
    domain: Mapped[str | None] = mapped_column(String(255), unique=True, index=True, nullable=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)

    # Нода, на которой живёт орг (её лендинг + школы). Орг/школы НЕ крутятся на ядре.
    node_id: Mapped[int | None] = mapped_column(
        ForeignKey("nodes.id", ondelete="SET NULL"), nullable=True, index=True
    )
    landing_status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="pending", server_default="pending",
        comment="pending | active | failed — статус контейнера-лендинга на ноде",
    )

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
    suspended_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    plan_tier: Mapped[str] = mapped_column(
        String(32), nullable=False, default="starter", server_default="starter",
        comment="free | starter | pro | enterprise",
    )
    max_schools: Mapped[int] = mapped_column(Integer, nullable=False, default=5, server_default="5")
    max_custom_domains: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    custom_landing_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    max_nodes: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")

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
    nodes: Mapped[list["Node"]] = relationship(
        back_populates="organization",
        cascade="all, delete-orphan",
        foreign_keys="[Node.org_id]",
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
    db_password: Mapped[str] = mapped_column(EncryptedString(255), nullable=False)
    secret_key: Mapped[str] = mapped_column(EncryptedString(255), nullable=False)
    telemetry_token: Mapped[str] = mapped_column(EncryptedString(255), nullable=False)
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
    # Идентичность школы — её ПОДДОМЕН в домене орг (полный хост `<subdomain>.<org.domain>`).
    # slug — внутренний производный токен (имена контейнеров/маршрутов), наружу не виден.
    slug: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    subdomain: Mapped[str | None] = mapped_column(String(63), nullable=True)
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
    # Заморозка школы: 'suspended' — app-контейнер остановлен, маршрут отдаёт
    # страницу «школа приостановлена», том сохранён. Разморозка → 'active'.
    suspended_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # Источник заморозки: 'manual' (org_admin вручную) | 'org' (каскад при заморозке
    # орг). Разморозка орг поднимает ТОЛЬКО школы с 'org' — вручную замороженные
    # остаются замороженными.
    suspended_by: Mapped[str | None] = mapped_column(String(10), nullable=True)

    organization: Mapped[Organization] = relationship(back_populates="schools")
    secret: Mapped["SchoolSecret | None"] = relationship(
        back_populates="school", cascade="all, delete-orphan", uselist=False
    )
    domains: Mapped[list["SchoolDomain"]] = relationship(
        back_populates="school", cascade="all, delete-orphan"
    )
    node_assignments: Mapped[list["NodeAssignment"]] = relationship(
        back_populates="school", cascade="all, delete-orphan"
    )
    update_history: Mapped[list["UpdateHistory"]] = relationship(
        back_populates="school", cascade="all, delete-orphan"
    )


class SchoolSecret(Base):
    """Секреты стека школы (плейнтекст; KMS — позже). Зеркало OrganizationSecret."""

    __tablename__ = "school_secrets"

    school_id: Mapped[int] = mapped_column(
        ForeignKey("schools.id", ondelete="CASCADE"), primary_key=True
    )
    db_password: Mapped[str] = mapped_column(EncryptedString(255), nullable=False)
    secret_key: Mapped[str] = mapped_column(EncryptedString(255), nullable=False)
    telemetry_token: Mapped[str] = mapped_column(EncryptedString(255), nullable=False)
    # Отдельный токен для входящего /internal-RPC (управление учётками school_admin),
    # чтобы он не совпадал с telemetry_token (которым тенант шлёт метрики наверх).
    # Раньше один токен гейтил и телеметрию, и управление админами — утечка
    # телеметрийного токена давала контроль над школой (AUDIT, isolation #6).
    # nullable: у школ, заведённых до разведения, бэкфилится при следующем
    # provision/update (до тех пор RPC падает обратно на telemetry_token).
    internal_rpc_token: Mapped[str | None] = mapped_column(EncryptedString(255), nullable=True)
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


class SchoolMetric(Base):
    """Последний снимок телеметрии школы (R3). Тенант шлёт агрегаты без PII раз в
    минуту; ядро хранит свежий снимок + last_heartbeat_at для liveness. Одна строка
    на школу (upsert). Полный снимок дублируется в payload для расширяемости."""

    __tablename__ = "school_metrics"

    school_id: Mapped[int] = mapped_column(
        ForeignKey("schools.id", ondelete="CASCADE"), primary_key=True
    )
    last_heartbeat_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    users_total: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    students: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    teachers: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    parents: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    admins: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    grades_total: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    avg_grade: Mapped[float | None] = mapped_column(Float, nullable=True)
    active_24h: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    balance_total: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0, server_default="0")
    payload: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)


class AgentState(Base):
    """Локальная идентичность узла организации (режим ROLE=org_agent). Одна строка:
    после enroll-on-boot хранит, к какой орг подключён узел и текущий релиз.
    В режиме platform не используется."""

    __tablename__ = "agent_state"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    org_slug: Mapped[str] = mapped_column(String(40), nullable=False)
    org_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    core_url: Mapped[str] = mapped_column(String(255), nullable=False)
    release_tag: Mapped[str | None] = mapped_column(String(64), nullable=True)
    enrolled_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)


class EnrollmentToken(Base):
    """Одноразовый токен подключения узла организации (см. ARCH_ORG_NODE.md).

    platform_admin выдаёт токен для орг; новый сервер орг при первом запуске
    предъявляет его на `POST /api/enroll` и получает свою конфигурацию (org_slug,
    текущий релиз). Храним только sha256-хеш; плейнтекст показывается один раз."""

    __tablename__ = "enrollment_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    org_id: Mapped[int | None] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True, index=True
    )
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)


class Subscription(Base):
    """Подписка организации (R2). 1:1 с Organization. Тариф (tier) живёт в
    organizations.plan; здесь — жизненный цикл оплаты: триал, оплачено-до, статус."""

    __tablename__ = "subscriptions"

    org_id: Mapped[int] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), primary_key=True
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="trial", server_default="trial",
        comment="trial | active | past_due | canceled",
    )
    trial_ends_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    paid_until: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class Invoice(Base):
    """Счёт/платёж организации (R2). Ручной платёж — сразу status='paid'. Под
    провайдера (ЮKassa): счёт создаётся 'open', закрывается webhook'ом →'paid'."""

    __tablename__ = "invoices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    org_id: Mapped[int] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    plan: Mapped[str] = mapped_column(String(30), nullable=False)
    amount_rub: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    period_start: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    period_end: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="open", server_default="open",
        comment="open | paid | void",
    )
    provider: Mapped[str] = mapped_column(String(30), nullable=False, default="manual", server_default="manual")
    provider_ref: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class ContactLead(Base):
    """Заявка с лендинга («Связаться»). Это лиды ПЛАТФОРМЫ (а не школы): форма на
    апекс-домене ядра постит сюда через публичный POST /api/contact. Видит и
    обрабатывает platform_admin. Раньше форма била в несуществующий эндпоинт и
    все заявки терялись (см. docs/AUDIT_2026-06-12.md)."""

    __tablename__ = "contact_leads"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    org_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_host: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="new", server_default="new",
        comment="new | handled",
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)


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
    # Git-SHA коммита, из которого CI собрал образ тенанта. Делает релиз
    # привязанным к РЕАЛЬНОМУ изменению кода (нельзя выпустить OTA без нового
    # коммита/образа — см. publish-гард). Пусто у ручных/легаси-релизов.
    source_commit: Mapped[str | None] = mapped_column(String(64), nullable=True)
    is_current: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    published_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    published_by: Mapped[int | None] = mapped_column(
        ForeignKey("platform_admins.id", ondelete="SET NULL"), nullable=True
    )


# ============================================================================
# Инфраструктура: ноды (серверы), распределение школ, история обновлений.
# См. docs/INFRASTRUCTURE_PLAN.md.
# ============================================================================


class Node(Base):
    """Серверная нода — физический или виртуальный сервер, на котором крутятся
    школы организации. Управляется агентом (ROLE=org_agent)."""

    __tablename__ = "nodes"
    __table_args__ = (UniqueConstraint("hostname", name="uq_nodes_hostname"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    hostname: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    ssh_port: Mapped[int] = mapped_column(Integer, nullable=False, default=22, server_default="22")

    cpu_cores: Mapped[int] = mapped_column(Integer, nullable=False, default=2)
    ram_gb: Mapped[float] = mapped_column(Float, nullable=False, default=2.0)
    disk_gb: Mapped[float] = mapped_column(Float, nullable=False, default=20.0)

    country_code: Mapped[str | None] = mapped_column(
        String(2), nullable=True, comment="ISO 3166-1 alpha-2 (RU, DE, US...) — для флага в UI"
    )

    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="pending_bootstrap", server_default="pending_bootstrap",
        comment="pending_bootstrap | active | draining | offline | decommissioned (ставит воркер)",
    )
    # Визуальный вкл/выкл оператором: выключенная нода не используется планировщиком
    # (новые школы не назначаются), но физически продолжает работать. Статус ставит
    # воркер автоматически — enabled задаёт человек.
    enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )

    org_id: Mapped[int | None] = mapped_column(
        ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True, index=True
    )
    enrollment_token_id: Mapped[int | None] = mapped_column(
        ForeignKey("enrollment_tokens.id", ondelete="SET NULL"), nullable=True
    )

    agent_version: Mapped[str | None] = mapped_column(String(32), nullable=True)
    last_heartbeat: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    max_schools: Mapped[int] = mapped_column(Integer, nullable=False, default=5)

    # Снимок реальной загрузки ноды + латентность ядро→воркер. Обновляет монитор-петля
    # ядра (опрашивает /api/agent/health воркера). NULL — метрики ещё не снимались.
    last_cpu_percent: Mapped[float | None] = mapped_column(Float, nullable=True)
    last_ram_used_mb: Mapped[int | None] = mapped_column(Integer, nullable=True)
    last_ram_total_mb: Mapped[int | None] = mapped_column(Integer, nullable=True)
    last_disk_used_gb: Mapped[float | None] = mapped_column(Float, nullable=True)
    last_disk_total_gb: Mapped[float | None] = mapped_column(Float, nullable=True)
    last_ping_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    metrics_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )

    organization: Mapped[Organization | None] = relationship(
        back_populates="nodes", foreign_keys="[Node.org_id]"
    )
    assignments: Mapped[list["NodeAssignment"]] = relationship(
        back_populates="node", cascade="all, delete-orphan"
    )


class NodeAssignment(Base):
    """Привязка школы к ноде — на каком сервере крутится школа."""

    __tablename__ = "node_assignments"
    __table_args__ = (
        UniqueConstraint("school_id", name="uq_node_assignments_school"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    node_id: Mapped[int] = mapped_column(
        ForeignKey("nodes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    school_id: Mapped[int] = mapped_column(
        ForeignKey("schools.id", ondelete="CASCADE"), nullable=False, index=True
    )
    assigned_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)

    node: Mapped[Node] = relationship(back_populates="assignments")
    school: Mapped[School] = relationship(back_populates="node_assignments")


class UpdateHistory(Base):
    """История OTA-обновлений школы. Записывается при каждом update_school."""

    __tablename__ = "update_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    school_id: Mapped[int] = mapped_column(
        ForeignKey("schools.id", ondelete="CASCADE"), nullable=False, index=True
    )
    from_version: Mapped[str | None] = mapped_column(String(64), nullable=True)
    to_version: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="pending", server_default="pending",
        comment="pending | success | failed | rolled_back",
    )
    started_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    school: Mapped[School] = relationship(back_populates="update_history")


class PlatformSetting(Base):
    """Key-value настройки платформы (источник OTA-обновлений и т.п.). Значение
    шифруется at-rest (EncryptedString) — подходит и для секретов (GH-токен реестра)."""

    __tablename__ = "platform_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    key: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    value: Mapped[str | None] = mapped_column(EncryptedString(1024), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )


# ============================================================================
# Канал «ядро → организаторы»: новости (broadcast/таргет), уведомления (per
# org_admin) и поддержка (тикеты). platform_admin пишет новости и отвечает в
# поддержку; org_admin получает уведомления (колокол) и ведёт переписку
# (плавающий чат). Всё в контур-плейне, школьных данных не касается.
# ============================================================================


class NewsPost(Base):
    """Новость, написанная platform_admin в ядре. Адресуется всем организациям
    (`is_global`) или выбранным (через NewsTarget). Публикация рассылается как
    Notification активным org_admin адресатов."""

    __tablename__ = "news_posts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    is_global: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false",
        comment="true — видна всем орг; false — только адресатам из news_targets",
    )
    is_published: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    pinned: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    author_id: Mapped[int | None] = mapped_column(
        ForeignKey("platform_admins.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )

    targets: Mapped[list["NewsTarget"]] = relationship(
        back_populates="news", cascade="all, delete-orphan"
    )


class NewsTarget(Base):
    """Адресат новости — организация. Используется когда NewsPost.is_global=false."""

    __tablename__ = "news_targets"
    __table_args__ = (UniqueConstraint("news_id", "org_id", name="uq_news_targets_news_org"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    news_id: Mapped[int] = mapped_column(
        ForeignKey("news_posts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    org_id: Mapped[int] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )

    news: Mapped[NewsPost] = relationship(back_populates="targets")


class Notification(Base):
    """Уведомление для конкретного org_admin (колокол + всплывашка). Источники:
    публикация новости (`type=news`) и ответ поддержки (`type=support`). ref_id —
    id новости/тикета для перехода."""

    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    org_admin_id: Mapped[int] = mapped_column(
        ForeignKey("org_admins.id", ondelete="CASCADE"), nullable=False, index=True
    )
    type: Mapped[str] = mapped_column(String(20), nullable=False, comment="news | support")
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    ref_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_read: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)


class SupportTicket(Base):
    """Обращение в поддержку. Открывает org_admin (плавающий чат), обрабатывает
    platform_admin (раздел «Поддержка» в ядре). Скоуп — org_id. Флаги *_unread
    показывают, у кого есть непрочитанное (для бейджа ядра и колокола орг)."""

    __tablename__ = "support_tickets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    org_id: Mapped[int] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    subject: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="open", server_default="open",
        comment="open | pending | closed",
    )
    created_by_org_admin_id: Mapped[int | None] = mapped_column(
        ForeignKey("org_admins.id", ondelete="SET NULL"), nullable=True
    )
    # У platform_admin есть непрочитанные сообщения от орг (для бейджа «Поддержка»).
    platform_unread: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    # У org_admin есть непрочитанный ответ поддержки (для колокола/чата).
    org_unread: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )
    last_message_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    messages: Mapped[list["SupportMessage"]] = relationship(
        back_populates="ticket", cascade="all, delete-orphan"
    )


class SupportMessage(Base):
    """Сообщение в тикете. sender_type — кто написал (org_admin | platform_admin)."""

    __tablename__ = "support_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ticket_id: Mapped[int] = mapped_column(
        ForeignKey("support_tickets.id", ondelete="CASCADE"), nullable=False, index=True
    )
    sender_type: Mapped[str] = mapped_column(String(20), nullable=False, comment="org_admin | platform_admin")
    sender_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)

    ticket: Mapped[SupportTicket] = relationship(back_populates="messages")
