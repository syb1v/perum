"""add durable social read receipts

Revision ID: tenant_0035_social_read_receipts
Revises: tenant_0034_academic_archiving
"""
from alembic import op
import sqlalchemy as sa

revision = "tenant_0035_social_read_receipts"
down_revision = "tenant_0034_academic_archiving"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "social_read_receipts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("school_id", sa.Integer(), nullable=False),
        sa.Column("actor_id", sa.Integer(), nullable=False),
        sa.Column("conversation_id", sa.Integer(), nullable=False),
        sa.Column("message_id", sa.Integer(), nullable=False),
        sa.Column("client_action_id", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["school_id"], ["schools.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["actor_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["conversation_id"], ["conversations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("actor_id", "client_action_id", name="uq_social_read_receipts_actor_action"),
    )
    op.create_index("ix_social_read_receipts_school_id", "social_read_receipts", ["school_id"])
    op.create_index("ix_social_read_receipts_actor_id", "social_read_receipts", ["actor_id"])


def downgrade() -> None:
    op.drop_index("ix_social_read_receipts_actor_id", table_name="social_read_receipts")
    op.drop_index("ix_social_read_receipts_school_id", table_name="social_read_receipts")
    op.drop_table("social_read_receipts")
