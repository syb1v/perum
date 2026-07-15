from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, LargeBinary, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class PushInstallation(Base):
    __tablename__ = "push_installations"
    __table_args__ = (CheckConstraint("platform IN ('ios', 'android')", name="ck_push_installations_platform"), CheckConstraint("state IN ('active', 'revoked')", name="ck_push_installations_state"))
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    school_id: Mapped[int] = mapped_column(ForeignKey("schools.id", ondelete="CASCADE"), nullable=False, index=True)
    platform: Mapped[str] = mapped_column(String(20), nullable=False)
    device_name: Mapped[str | None] = mapped_column(String(255))
    state: Mapped[str] = mapped_column(String(20), nullable=False, default="active", server_default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())


class PushEndpoint(Base):
    __tablename__ = "push_endpoints"
    __table_args__ = (UniqueConstraint("installation_id", "provider", "environment", "app_id", name="uq_push_endpoint_installation_provider_env_app"), CheckConstraint("provider IN ('expo', 'fcm', 'apns', 'rustore', 'huawei')", name="ck_push_endpoints_provider"), CheckConstraint("environment IN ('development', 'production')", name="ck_push_endpoints_environment"), CheckConstraint("state IN ('active', 'replaced', 'invalid', 'revoked')", name="ck_push_endpoints_state"))
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    school_id: Mapped[int] = mapped_column(ForeignKey("schools.id", ondelete="CASCADE"), nullable=False, index=True)
    installation_id: Mapped[str] = mapped_column(ForeignKey("push_installations.id", ondelete="CASCADE"), nullable=False, index=True)
    provider: Mapped[str] = mapped_column(String(20), nullable=False)
    environment: Mapped[str] = mapped_column(String(20), nullable=False)
    app_id: Mapped[str] = mapped_column(String(200), nullable=False)
    app_version: Mapped[str | None] = mapped_column(String(50))
    token_ciphertext: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    token_key_id: Mapped[str] = mapped_column(String(32), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    state: Mapped[str] = mapped_column(String(20), nullable=False, default="active", server_default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())


class PushRegistration(Base):
    __tablename__ = "push_registrations"
    __table_args__ = (UniqueConstraint("installation_id", "user_id", name="uq_push_registration_installation_user"), CheckConstraint("state IN ('active', 'revoked')", name="ck_push_registrations_state"))
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    school_id: Mapped[int] = mapped_column(ForeignKey("schools.id", ondelete="CASCADE"), nullable=False, index=True)
    installation_id: Mapped[str] = mapped_column(ForeignKey("push_installations.id", ondelete="CASCADE"), nullable=False, index=True)
    endpoint_id: Mapped[str] = mapped_column(ForeignKey("push_endpoints.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    refresh_session_id: Mapped[int] = mapped_column(ForeignKey("refresh_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    state: Mapped[str] = mapped_column(String(20), nullable=False, default="active", server_default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime)


class PushOutbox(Base):
    __tablename__ = "push_outbox"
    __table_args__ = (UniqueConstraint("installation_id", "user_id", "event_key", name="uq_push_outbox_installation_user_event"), CheckConstraint("state IN ('pending', 'suppressed', 'delivered', 'failed')", name="ck_push_outbox_state"))
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    school_id: Mapped[int] = mapped_column(ForeignKey("schools.id", ondelete="CASCADE"), nullable=False, index=True)
    installation_id: Mapped[str] = mapped_column(ForeignKey("push_installations.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    event_key: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str] = mapped_column(String(50), nullable=False)
    target: Mapped[str] = mapped_column(String(255), nullable=False)
    state: Mapped[str] = mapped_column(String(20), nullable=False, default="suppressed", server_default="suppressed")
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
