"""synthetic seed ownership

Revision ID: tenant_0039_synru_ownership
Revises: tenant_0038_escalation_dlq
"""

from alembic import op
import sqlalchemy as sa


revision = "tenant_0039_synru_ownership"
down_revision = "tenant_0038_escalation_dlq"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "synthetic_seed_rows",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("namespace", sa.String(length=32), nullable=False),
        sa.Column("school_id", sa.Integer(), nullable=False),
        sa.Column("table_name", sa.String(length=64), nullable=False),
        sa.Column("row_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["school_id"], ["schools.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("namespace", "school_id", "table_name", "row_id", name="uq_synthetic_seed_row"),
    )
    op.create_index("ix_synthetic_seed_rows_namespace", "synthetic_seed_rows", ["namespace"])
    op.create_index("ix_synthetic_seed_rows_school_id", "synthetic_seed_rows", ["school_id"])


def downgrade() -> None:
    bind = op.get_bind()
    ownership_count = bind.scalar(sa.text("SELECT count(*) FROM synthetic_seed_rows"))
    marker_count = bind.scalar(sa.text("SELECT count(*) FROM tenant_meta WHERE key LIKE 'synru:%'"))
    if ownership_count or marker_count:
        raise RuntimeError(
            "refusing synthetic ownership downgrade while synthetic data or markers exist: "
            f"ownership_rows={ownership_count}, markers={marker_count}"
        )
    op.drop_index("ix_synthetic_seed_rows_school_id", table_name="synthetic_seed_rows")
    op.drop_index("ix_synthetic_seed_rows_namespace", table_name="synthetic_seed_rows")
    op.drop_table("synthetic_seed_rows")
