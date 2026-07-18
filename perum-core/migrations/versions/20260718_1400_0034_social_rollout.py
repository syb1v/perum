"""school social rollout desired and observed generation

Revision ID: 0034_social_rollout
Revises: 0033_social_ready
"""
from alembic import op
import sqlalchemy as sa

revision = "0034_social_rollout"
down_revision = "0033_social_ready"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("school_deployment_snapshots", sa.Column("social_generation", sa.Integer(), nullable=False, server_default="0"))
    op.create_table(
        "school_social_rollouts",
        sa.Column("school_id", sa.Integer(), sa.ForeignKey("schools.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("platform_granted", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("org_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("generation", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("applied_generation", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("applied_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("apply_status", sa.String(32), nullable=False, server_default="converged"),
        sa.Column("apply_error", sa.Text(), nullable=True),
        sa.Column("desired_at", sa.DateTime(), nullable=True),
        sa.Column("applied_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_table(
        "school_social_rollout_audit",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("school_id", sa.Integer(), sa.ForeignKey("schools.id", ondelete="CASCADE"), nullable=False),
        sa.Column("actor_type", sa.String(32), nullable=False),
        sa.Column("actor_id", sa.Integer(), nullable=False),
        sa.Column("action", sa.String(32), nullable=False),
        sa.Column("generation", sa.Integer(), nullable=False),
        sa.Column("platform_granted", sa.Boolean(), nullable=False),
        sa.Column("org_enabled", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_school_social_rollout_audit_school_id", "school_social_rollout_audit", ["school_id"])


def downgrade() -> None:
    op.drop_index("ix_school_social_rollout_audit_school_id", table_name="school_social_rollout_audit")
    op.drop_table("school_social_rollout_audit")
    op.drop_table("school_social_rollouts")
    op.drop_column("school_deployment_snapshots", "social_generation")
