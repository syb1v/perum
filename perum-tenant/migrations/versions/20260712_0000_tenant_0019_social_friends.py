"""social friends

Revision ID: tenant_0019_social_friends
Revises: tenant_0018_refresh_sessions
"""
from alembic import op
import sqlalchemy as sa

revision = "tenant_0019_social_friends"
down_revision = "tenant_0018_refresh_sessions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table("school_social_settings", sa.Column("school_id", sa.Integer(), sa.ForeignKey("schools.id", ondelete="CASCADE"), primary_key=True), sa.Column("social_enabled", sa.Boolean(), nullable=False, server_default=sa.false()), sa.Column("friend_scope", sa.String(20), nullable=False, server_default="classmates"), sa.Column("social_min_grade", sa.Integer()), sa.Column("social_max_grade", sa.Integer()), sa.Column("parent_chat_visibility", sa.String(20), nullable=False, server_default="metadata"), sa.Column("message_retention_days", sa.Integer(), nullable=False, server_default="365"), sa.Column("message_links_allowed", sa.Boolean(), nullable=False, server_default=sa.false()), sa.Column("message_attachments_enabled", sa.Boolean(), nullable=False, server_default=sa.true()), sa.Column("social_quiet_hours_start", sa.Time()), sa.Column("social_quiet_hours_end", sa.Time()), sa.Column("social_moderation_enabled", sa.Boolean(), nullable=False, server_default=sa.false()), sa.CheckConstraint("friend_scope IN ('classmates', 'school')"), sa.CheckConstraint("parent_chat_visibility IN ('disabled', 'metadata', 'full')"), sa.CheckConstraint("social_min_grade IS NULL OR social_min_grade BETWEEN 1 AND 11"), sa.CheckConstraint("social_max_grade IS NULL OR social_max_grade BETWEEN 1 AND 11"), sa.CheckConstraint("social_min_grade IS NULL OR social_max_grade IS NULL OR social_min_grade <= social_max_grade"), sa.CheckConstraint("message_retention_days BETWEEN 30 AND 3650"))
    op.create_table("friend_requests", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("school_id", sa.Integer(), sa.ForeignKey("schools.id", ondelete="CASCADE"), nullable=False), sa.Column("requester_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False), sa.Column("addressee_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False), sa.Column("user_low_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False), sa.Column("user_high_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False), sa.Column("status", sa.String(20), nullable=False, server_default="pending"), sa.Column("client_request_id", sa.String(64), nullable=False), sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False), sa.Column("responded_at", sa.DateTime()), sa.Column("expires_at", sa.DateTime(), nullable=False), sa.CheckConstraint("requester_id <> addressee_id"), sa.CheckConstraint("user_low_id < user_high_id"), sa.CheckConstraint("status IN ('pending', 'accepted', 'rejected', 'cancelled', 'expired')"), sa.UniqueConstraint("school_id", "requester_id", "client_request_id", name="uq_friend_requests_client_id"))
    op.create_index("uq_friend_requests_pending_pair", "friend_requests", ["school_id", "user_low_id", "user_high_id"], unique=True, postgresql_where=sa.text("status = 'pending'"), sqlite_where=sa.text("status = 'pending'"))
    op.create_table("friendships", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("school_id", sa.Integer(), sa.ForeignKey("schools.id", ondelete="CASCADE"), nullable=False), sa.Column("user_low_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False), sa.Column("user_high_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False), sa.Column("created_from_request_id", sa.Integer(), sa.ForeignKey("friend_requests.id", ondelete="RESTRICT"), nullable=False), sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False), sa.Column("ended_at", sa.DateTime()), sa.Column("ended_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL")), sa.Column("end_reason", sa.String(30)), sa.CheckConstraint("user_low_id < user_high_id"))
    op.create_index("uq_friendships_active_pair", "friendships", ["school_id", "user_low_id", "user_high_id"], unique=True, postgresql_where=sa.text("ended_at IS NULL"), sqlite_where=sa.text("ended_at IS NULL"))
    op.create_table("user_blocks", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("school_id", sa.Integer(), sa.ForeignKey("schools.id", ondelete="CASCADE"), nullable=False), sa.Column("blocker_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False), sa.Column("blocked_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False), sa.Column("source", sa.String(20), nullable=False, server_default="user"), sa.Column("reason_code", sa.String(50)), sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False), sa.Column("released_at", sa.DateTime()), sa.CheckConstraint("blocker_id <> blocked_id"), sa.CheckConstraint("source IN ('user', 'moderator', 'system')"))
    op.create_index("uq_user_blocks_active", "user_blocks", ["school_id", "blocker_id", "blocked_id"], unique=True, postgresql_where=sa.text("released_at IS NULL"), sqlite_where=sa.text("released_at IS NULL"))


def downgrade() -> None:
    op.drop_table("user_blocks")
    op.drop_table("friendships")
    op.drop_table("friend_requests")
    op.drop_table("school_social_settings")
