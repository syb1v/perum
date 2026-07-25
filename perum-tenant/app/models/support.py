from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, JSON, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class SupportTicket(Base):
    __tablename__ = "support_tickets"
    __table_args__ = (
        CheckConstraint("category IN ('general', 'technical', 'account', 'academic', 'safety', 'other')", name="ck_support_tickets_category"),
        CheckConstraint("status IN ('open', 'in_progress', 'waiting_requester', 'resolved', 'closed')", name="ck_support_tickets_status"),
        CheckConstraint("priority IN ('low', 'normal', 'high', 'urgent')", name="ck_support_tickets_priority"),
        CheckConstraint("escalation_status IN ('none', 'pending_delivery', 'pending_org_approval', 'approved', 'rejected', 'delivery_error')", name="ck_support_tickets_escalation_status"),
        CheckConstraint("version > 0", name="ck_support_tickets_version"),
        UniqueConstraint("school_id", "creator_id", "client_ticket_id", name="uq_support_tickets_client"),
        Index("ix_support_tickets_inbox", "school_id", "status", "priority", "last_message_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    public_id: Mapped[str] = mapped_column(String(36), nullable=False, unique=True)
    correlation_id: Mapped[str] = mapped_column(String(36), nullable=False, unique=True)
    school_id: Mapped[int] = mapped_column(ForeignKey("schools.id", ondelete="CASCADE"), nullable=False)
    creator_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    subject: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str] = mapped_column(String(20), nullable=False, default="general", server_default="general")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="open", server_default="open")
    priority: Mapped[str] = mapped_column(String(20), nullable=False, default="normal", server_default="normal")
    assignee_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    client_ticket_id: Mapped[str] = mapped_column(String(64), nullable=False)
    last_message_id: Mapped[str | None] = mapped_column(String(36))
    last_message_side: Mapped[str | None] = mapped_column(String(20))
    last_message_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    closed_at: Mapped[datetime | None] = mapped_column(DateTime)
    escalation_status: Mapped[str] = mapped_column(String(30), nullable=False, default="none", server_default="none")
    escalation_requested_at: Mapped[datetime | None] = mapped_column(DateTime)
    escalation_requested_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    core_ticket_id: Mapped[int | None] = mapped_column(Integer)
    last_core_message_cursor: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")


class SupportMessage(Base):
    __tablename__ = "support_messages"
    __table_args__ = (
        CheckConstraint("side IN ('requester', 'shared_inbox', 'admin_inbox')", name="ck_support_messages_side"),
        UniqueConstraint("ticket_id", "sender_id", "client_message_id", name="uq_support_messages_client"),
        Index("ix_support_messages_ticket_created", "ticket_id", "created_at", "id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    school_id: Mapped[int] = mapped_column(ForeignKey("schools.id", ondelete="CASCADE"), nullable=False)
    ticket_id: Mapped[int] = mapped_column(ForeignKey("support_tickets.id", ondelete="CASCADE"), nullable=False)
    sender_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    client_message_id: Mapped[str] = mapped_column(String(64), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    side: Mapped[str] = mapped_column(String(20), nullable=False)
    sender_snapshot: Mapped[str | None] = mapped_column(String(50))
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())


class SupportParticipant(Base):
    __tablename__ = "support_ticket_participants"
    __table_args__ = (
        CheckConstraint("kind IN ('requester', 'shared_inbox')", name="ck_support_ticket_participants_kind"),
        CheckConstraint("(kind = 'requester' AND user_id IS NOT NULL) OR (kind = 'shared_inbox' AND user_id IS NULL)", name="ck_support_ticket_participants_user"),
        UniqueConstraint("ticket_id", "kind", name="uq_support_ticket_participants_kind"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    school_id: Mapped[int] = mapped_column(ForeignKey("schools.id", ondelete="CASCADE"), nullable=False)
    ticket_id: Mapped[int] = mapped_column(ForeignKey("support_tickets.id", ondelete="CASCADE"), nullable=False)
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    last_read_message_id: Mapped[str | None] = mapped_column(ForeignKey("support_messages.id", ondelete="SET NULL"))
    read_at: Mapped[datetime | None] = mapped_column(DateTime)


class SupportEvent(Base):
    __tablename__ = "support_ticket_events"
    __table_args__ = (
        UniqueConstraint("ticket_id", "client_action_id", name="uq_support_ticket_events_client_action"),
        Index("ix_support_ticket_events_ticket_created", "ticket_id", "created_at", "id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    school_id: Mapped[int] = mapped_column(ForeignKey("schools.id", ondelete="CASCADE"), nullable=False)
    ticket_id: Mapped[int] = mapped_column(ForeignKey("support_tickets.id", ondelete="CASCADE"), nullable=False)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    action: Mapped[str] = mapped_column(String(50), nullable=False)
    metadata_json: Mapped[dict | list | None] = mapped_column(JSON)
    metadata_text: Mapped[str | None] = mapped_column(Text)
    client_action_id: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())


class SupportEscalationOutbox(Base):
    __tablename__ = "support_escalation_outbox"
    __table_args__ = (
        CheckConstraint("status IN ('pending', 'processing', 'delivered', 'error', 'dead_letter')", name="ck_support_escalation_outbox_status"),
        UniqueConstraint("ticket_id", name="uq_support_escalation_outbox_ticket"),
        Index("ix_support_escalation_outbox_due", "status", "next_attempt_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    school_id: Mapped[int] = mapped_column(ForeignKey("schools.id", ondelete="CASCADE"), nullable=False)
    ticket_id: Mapped[int] = mapped_column(ForeignKey("support_tickets.id", ondelete="CASCADE"), nullable=False)
    payload_json: Mapped[dict] = mapped_column(JSON, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending", server_default="pending")
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    next_attempt_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    last_error: Mapped[str | None] = mapped_column(Text)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())


class SupportEscalationReceipt(Base):
    __tablename__ = "support_escalation_receipts"
    __table_args__ = (UniqueConstraint("ticket_id", "core_message_id", name="uq_support_escalation_receipt_message"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    school_id: Mapped[int] = mapped_column(ForeignKey("schools.id", ondelete="CASCADE"), nullable=False)
    ticket_id: Mapped[int] = mapped_column(ForeignKey("support_tickets.id", ondelete="CASCADE"), nullable=False)
    core_message_id: Mapped[int] = mapped_column(Integer, nullable=False)
    message_id: Mapped[str] = mapped_column(ForeignKey("support_messages.id", ondelete="CASCADE"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
