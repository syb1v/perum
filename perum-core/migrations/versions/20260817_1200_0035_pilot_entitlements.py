"""append-only expiring pilot entitlements

Revision ID: 0035_pilot_entitlements
Revises: 0034_social_rollout
"""
from alembic import op
import sqlalchemy as sa

revision = "0035_pilot_entitlements"
down_revision = "0034_social_rollout"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("organizations", sa.Column("suspension_source", sa.String(30), nullable=True))
    op.add_column("organizations", sa.Column("suspension_reason", sa.Text(), nullable=True))
    op.execute(
        "UPDATE organizations SET suspension_source = 'legacy_manual', "
        "suspension_reason = 'suspension predates provenance tracking' "
        "WHERE status = 'suspended'"
    )
    op.create_table(
        "pilot_entitlements",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("org_id", sa.Integer(), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("starts_at", sa.DateTime(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("approval_reference", sa.String(255), nullable=False),
        sa.Column("idempotency_key", sa.String(255), nullable=False),
        sa.Column("granted_by", sa.Integer(), sa.ForeignKey("platform_admins.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("reconciliation_state", sa.String(40), nullable=False, server_default="active"),
        sa.Column("reconciled_at", sa.DateTime(), nullable=True),
        sa.Column("reconciled_by", sa.Integer(), sa.ForeignKey("platform_admins.id", ondelete="RESTRICT"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("expires_at > starts_at", name="ck_pilot_entitlements_valid_window"),
        sa.UniqueConstraint("idempotency_key", name="uq_pilot_entitlements_idempotency_key"),
    )
    op.create_index("ix_pilot_entitlements_org_id", "pilot_entitlements", ["org_id"])
    op.create_index("ix_pilot_entitlements_expires_at", "pilot_entitlements", ["expires_at"])


def downgrade() -> None:
    op.drop_index("ix_pilot_entitlements_expires_at", table_name="pilot_entitlements")
    op.drop_index("ix_pilot_entitlements_org_id", table_name="pilot_entitlements")
    op.drop_table("pilot_entitlements")
    op.drop_column("organizations", "suspension_reason")
    op.drop_column("organizations", "suspension_source")
