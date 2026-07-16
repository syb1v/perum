"""idempotent homework state receipts

Revision ID: tenant_0033_homework_state_receipts
Revises: tenant_0032_homework_semantics
"""
from alembic import op
import sqlalchemy as sa

revision = "tenant_0033_homework_state_receipts"
down_revision = "tenant_0032_homework_semantics"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "homework_state_receipts",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("school_id", sa.Integer(), sa.ForeignKey("schools.id", ondelete="CASCADE"), nullable=False),
        sa.Column("homework_id", sa.Integer(), sa.ForeignKey("homework.id", ondelete="CASCADE"), nullable=False),
        sa.Column("student_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("client_action_id", sa.String(64), nullable=False),
        sa.Column("expected_version", sa.Integer(), nullable=False),
        sa.Column("requested_status", sa.String(20), nullable=False),
        sa.Column("resulting_version", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("student_id", "client_action_id", name="uq_homework_state_receipt_action"),
    )
    op.create_index("ix_homework_state_receipts_school_id", "homework_state_receipts", ["school_id"])


def downgrade() -> None:
    op.drop_table("homework_state_receipts")
