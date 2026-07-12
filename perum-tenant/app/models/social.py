from datetime import datetime, time

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Index, Integer, String, Time, UniqueConstraint, text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class SocialSettings(Base):
    __tablename__ = "school_social_settings"
    __table_args__ = (
        CheckConstraint("friend_scope IN ('classmates', 'school')", name="ck_social_settings_friend_scope"),
        CheckConstraint("parent_chat_visibility IN ('disabled', 'metadata', 'full')", name="ck_social_settings_parent_visibility"),
        CheckConstraint("social_min_grade IS NULL OR social_min_grade BETWEEN 1 AND 11", name="ck_social_settings_min_grade"),
        CheckConstraint("social_max_grade IS NULL OR social_max_grade BETWEEN 1 AND 11", name="ck_social_settings_max_grade"),
        CheckConstraint("social_min_grade IS NULL OR social_max_grade IS NULL OR social_min_grade <= social_max_grade", name="ck_social_settings_grade_range"),
        CheckConstraint("message_retention_days BETWEEN 30 AND 3650", name="ck_social_settings_retention"),
    )

    school_id: Mapped[int] = mapped_column(ForeignKey("schools.id", ondelete="CASCADE"), primary_key=True)
    social_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="0")
    friend_scope: Mapped[str] = mapped_column(String(20), nullable=False, default="classmates", server_default="classmates")
    social_min_grade: Mapped[int | None] = mapped_column(Integer)
    social_max_grade: Mapped[int | None] = mapped_column(Integer)
    parent_chat_visibility: Mapped[str] = mapped_column(String(20), nullable=False, default="metadata", server_default="metadata")
    message_retention_days: Mapped[int] = mapped_column(Integer, nullable=False, default=365, server_default="365")
    message_links_allowed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="0")
    message_attachments_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="1")
    social_quiet_hours_start: Mapped[time | None] = mapped_column(Time)
    social_quiet_hours_end: Mapped[time | None] = mapped_column(Time)
    social_moderation_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="0")


class FriendRequest(Base):
    __tablename__ = "friend_requests"
    __table_args__ = (
        CheckConstraint("requester_id <> addressee_id", name="ck_friend_requests_not_self"),
        CheckConstraint("user_low_id < user_high_id", name="ck_friend_requests_pair_order"),
        CheckConstraint("status IN ('pending', 'accepted', 'rejected', 'cancelled', 'expired')", name="ck_friend_requests_status"),
        UniqueConstraint("school_id", "requester_id", "client_request_id", name="uq_friend_requests_client_id"),
        Index("uq_friend_requests_pending_pair", "school_id", "user_low_id", "user_high_id", unique=True, sqlite_where=text("status = 'pending'"), postgresql_where=text("status = 'pending'")),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    school_id: Mapped[int] = mapped_column(ForeignKey("schools.id", ondelete="CASCADE"), nullable=False, index=True)
    requester_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    addressee_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    user_low_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    user_high_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending", server_default="pending")
    client_request_id: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    responded_at: Mapped[datetime | None] = mapped_column(DateTime)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)


class Friendship(Base):
    __tablename__ = "friendships"
    __table_args__ = (
        CheckConstraint("user_low_id < user_high_id", name="ck_friendships_pair_order"),
        Index("uq_friendships_active_pair", "school_id", "user_low_id", "user_high_id", unique=True, sqlite_where=text("ended_at IS NULL"), postgresql_where=text("ended_at IS NULL")),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    school_id: Mapped[int] = mapped_column(ForeignKey("schools.id", ondelete="CASCADE"), nullable=False, index=True)
    user_low_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    user_high_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    created_from_request_id: Mapped[int] = mapped_column(ForeignKey("friend_requests.id", ondelete="RESTRICT"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime)
    ended_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    end_reason: Mapped[str | None] = mapped_column(String(30))


class UserBlock(Base):
    __tablename__ = "user_blocks"
    __table_args__ = (
        CheckConstraint("blocker_id <> blocked_id", name="ck_user_blocks_not_self"),
        CheckConstraint("source IN ('user', 'moderator', 'system')", name="ck_user_blocks_source"),
        Index("uq_user_blocks_active", "school_id", "blocker_id", "blocked_id", unique=True, sqlite_where=text("released_at IS NULL"), postgresql_where=text("released_at IS NULL")),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    school_id: Mapped[int] = mapped_column(ForeignKey("schools.id", ondelete="CASCADE"), nullable=False, index=True)
    blocker_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    blocked_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    source: Mapped[str] = mapped_column(String(20), nullable=False, default="user", server_default="user")
    reason_code: Mapped[str | None] = mapped_column(String(50))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    released_at: Mapped[datetime | None] = mapped_column(DateTime)
