"""social moderation and retention

Revision ID: tenant_0022_social_moderation
Revises: tenant_0021_social_messages
"""
from alembic import op
import sqlalchemy as sa

revision = "tenant_0022_social_moderation"
down_revision = "tenant_0021_social_messages"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("conversations") as batch:
        batch.add_column(sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()))
        batch.add_column(sa.Column("is_locked", sa.Boolean(), nullable=False, server_default=sa.false()))
    with op.batch_alter_table("messages") as batch:
        batch.add_column(sa.Column("is_visible", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.create_table("social_moderation_reports", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("school_id", sa.Integer(), sa.ForeignKey("schools.id", ondelete="CASCADE"), nullable=False), sa.Column("reporter_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False), sa.Column("reported_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False), sa.Column("message_id", sa.Integer(), sa.ForeignKey("messages.id", ondelete="RESTRICT"), nullable=False), sa.Column("category", sa.String(30), nullable=False), sa.Column("comment", sa.String(1000)), sa.Column("client_report_id", sa.String(64), nullable=False), sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()), sa.CheckConstraint("category IN ('harassment', 'bullying', 'threats', 'hate', 'sexual', 'spam', 'other')", name="ck_social_reports_category"), sa.UniqueConstraint("school_id", "reporter_id", "client_report_id", name="uq_social_reports_client_id"))
    op.create_index("ix_social_moderation_reports_school_id", "social_moderation_reports", ["school_id"])
    op.create_table("social_moderation_cases", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("school_id", sa.Integer(), sa.ForeignKey("schools.id", ondelete="CASCADE"), nullable=False), sa.Column("report_id", sa.Integer(), sa.ForeignKey("social_moderation_reports.id", ondelete="RESTRICT"), nullable=False, unique=True), sa.Column("conversation_id", sa.Integer(), sa.ForeignKey("conversations.id", ondelete="RESTRICT"), nullable=False), sa.Column("reported_message_id", sa.Integer(), sa.ForeignKey("messages.id", ondelete="RESTRICT"), nullable=False), sa.Column("status", sa.String(20), nullable=False, server_default="open"), sa.Column("version", sa.Integer(), nullable=False, server_default="1"), sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()), sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()), sa.CheckConstraint("status IN ('open', 'dismissed', 'actioned')", name="ck_social_cases_status"))
    op.create_index("ix_social_moderation_cases_school_id", "social_moderation_cases", ["school_id"])
    op.create_table("social_evidence_holds", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("school_id", sa.Integer(), sa.ForeignKey("schools.id", ondelete="CASCADE"), nullable=False), sa.Column("case_id", sa.Integer(), sa.ForeignKey("social_moderation_cases.id", ondelete="CASCADE"), nullable=False), sa.Column("message_id", sa.Integer(), sa.ForeignKey("messages.id", ondelete="RESTRICT"), nullable=False), sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()), sa.Column("released_at", sa.DateTime()), sa.Column("release_at", sa.DateTime(), nullable=False), sa.UniqueConstraint("case_id", "message_id", name="uq_social_evidence_case_message"))
    op.create_index("ix_social_evidence_holds_school_id", "social_evidence_holds", ["school_id"])
    op.create_table("social_moderation_audit_events", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("school_id", sa.Integer(), sa.ForeignKey("schools.id", ondelete="CASCADE"), nullable=False), sa.Column("case_id", sa.Integer(), sa.ForeignKey("social_moderation_cases.id", ondelete="RESTRICT"), nullable=False), sa.Column("actor_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False), sa.Column("event_type", sa.String(40), nullable=False), sa.Column("reason", sa.String(1000)), sa.Column("client_action_id", sa.String(64), nullable=False), sa.Column("expected_version", sa.Integer(), nullable=False), sa.Column("resulting_version", sa.Integer(), nullable=False), sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()), sa.UniqueConstraint("school_id", "actor_id", "client_action_id", name="uq_social_audit_client_action"))
    op.create_index("ix_social_moderation_audit_events_school_id", "social_moderation_audit_events", ["school_id"])


def downgrade() -> None:
    op.drop_table("social_moderation_audit_events")
    op.drop_table("social_evidence_holds")
    op.drop_table("social_moderation_cases")
    op.drop_table("social_moderation_reports")
    with op.batch_alter_table("messages") as batch:
        batch.drop_column("is_visible")
    with op.batch_alter_table("conversations") as batch:
        batch.drop_column("is_locked")
        batch.drop_column("is_active")
