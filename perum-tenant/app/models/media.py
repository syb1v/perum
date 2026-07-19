from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class UploadSession(Base):
    __tablename__ = "media_upload_sessions"
    __table_args__ = (
        CheckConstraint("state IN ('created', 'uploading', 'completed', 'expired', 'cancelled', 'failed')", name="ck_media_upload_sessions_state"),
        CheckConstraint("declared_size > 0", name="ck_media_upload_sessions_size"),
        UniqueConstraint("school_id", "owner_id", "client_upload_id", name="uq_media_upload_sessions_client"),
        Index("ix_media_upload_sessions_active", "school_id", "owner_id", "state", "expires_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    school_id: Mapped[int] = mapped_column(ForeignKey("schools.id", ondelete="CASCADE"), nullable=False)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    client_upload_id: Mapped[str] = mapped_column(String(64), nullable=False)
    purpose: Mapped[str] = mapped_column(String(40), nullable=False)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    declared_mime: Mapped[str] = mapped_column(String(50), nullable=False)
    declared_size: Mapped[int] = mapped_column(Integer, nullable=False)
    declared_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    state: Mapped[str] = mapped_column(String(20), nullable=False, default="created", server_default="created")
    object_id: Mapped[str | None] = mapped_column(ForeignKey("media_objects.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime)


class MediaObject(Base):
    __tablename__ = "media_objects"
    __table_args__ = (
        CheckConstraint("state IN ('pending', 'clean', 'infected', 'rejected', 'deleted', 'missing')", name="ck_media_objects_state"),
        CheckConstraint("size_bytes > 0", name="ck_media_objects_size"),
        Index("ix_media_objects_scan", "state", "created_at"),
        Index("ix_media_objects_scan_claim", "state", "next_scan_at", "scan_lease_expires_at"),
        Index("ix_media_objects_owner", "school_id", "owner_id", "state"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    school_id: Mapped[int] = mapped_column(ForeignKey("schools.id", ondelete="CASCADE"), nullable=False)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    purpose: Mapped[str] = mapped_column(String(40), nullable=False)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(50), nullable=False)
    extension: Mapped[str] = mapped_column(String(8), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    storage_key: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    state: Mapped[str] = mapped_column(String(20), nullable=False, default="pending", server_default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    scanned_at: Mapped[datetime | None] = mapped_column(DateTime)
    owner_grace_until: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime)
    scan_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    next_scan_at: Mapped[datetime | None] = mapped_column(DateTime)
    scan_lease_token: Mapped[str | None] = mapped_column(String(36))
    scan_lease_expires_at: Mapped[datetime | None] = mapped_column(DateTime)


class MediaBinding(Base):
    __tablename__ = "media_bindings"
    __table_args__ = (
        CheckConstraint("binding_type <> '' AND resource_id <> ''", name="ck_media_bindings_target"),
        UniqueConstraint("school_id", "object_id", "binding_type", "resource_id", name="uq_media_bindings_target"),
        Index("ix_media_bindings_resource", "school_id", "binding_type", "resource_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    school_id: Mapped[int] = mapped_column(ForeignKey("schools.id", ondelete="CASCADE"), nullable=False)
    object_id: Mapped[str] = mapped_column(ForeignKey("media_objects.id", ondelete="CASCADE"), nullable=False)
    binding_type: Mapped[str] = mapped_column(String(50), nullable=False)
    resource_id: Mapped[str] = mapped_column(String(64), nullable=False)
    bound_by_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())


class MediaScanResult(Base):
    __tablename__ = "media_scan_results"
    __table_args__ = (
        CheckConstraint("verdict IN ('clean', 'infected', 'unavailable', 'error')", name="ck_media_scan_results_verdict"),
        Index("ix_media_scan_results_object", "object_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    school_id: Mapped[int] = mapped_column(ForeignKey("schools.id", ondelete="CASCADE"), nullable=False)
    object_id: Mapped[str] = mapped_column(ForeignKey("media_objects.id", ondelete="CASCADE"), nullable=False)
    scanner: Mapped[str] = mapped_column(String(80), nullable=False)
    verdict: Mapped[str] = mapped_column(String(20), nullable=False)
    engine_version: Mapped[str | None] = mapped_column(String(40))
    signature_version: Mapped[str | None] = mapped_column(String(40))
    signature_at: Mapped[datetime | None] = mapped_column(DateTime)
    detail_code: Mapped[str | None] = mapped_column(String(40))
    duration_ms: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())


class MediaAuditEvent(Base):
    __tablename__ = "media_audit_events"
    __table_args__ = (Index("ix_media_audit_events_school_created", "school_id", "created_at"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    school_id: Mapped[int] = mapped_column(ForeignKey("schools.id", ondelete="CASCADE"), nullable=False)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    session_id: Mapped[str | None] = mapped_column(String(36))
    object_id: Mapped[str | None] = mapped_column(String(36))
    event_type: Mapped[str] = mapped_column(String(50), nullable=False)
    outcome: Mapped[str] = mapped_column(String(30), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
