"""add nodes and node_assignments tables

Revision ID: 0015_add_nodes
Revises: 0014_release_source_commit
Create Date: 2026-06-18
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0015_add_nodes"
down_revision: Union[str, None] = "0014_release_source_commit"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "nodes",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(64), nullable=False, index=True),
        sa.Column("hostname", sa.String(255), nullable=False, unique=True),
        sa.Column("ssh_port", sa.Integer, nullable=False, server_default="22"),
        sa.Column("cpu_cores", sa.Integer, nullable=False, server_default="2"),
        sa.Column("ram_gb", sa.Float, nullable=False, server_default="2.0"),
        sa.Column("disk_gb", sa.Float, nullable=False, server_default="20.0"),
        sa.Column(
            "status",
            sa.String(30),
            nullable=False,
            server_default="pending_bootstrap",
            comment="pending_bootstrap | active | draining | offline | decommissioned",
        ),
        sa.Column(
            "org_id",
            sa.Integer,
            sa.ForeignKey("organizations.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        ),
        sa.Column(
            "enrollment_token_id",
            sa.Integer,
            sa.ForeignKey("enrollment_tokens.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("agent_version", sa.String(32), nullable=True),
        sa.Column("last_heartbeat", sa.DateTime, nullable=True),
        sa.Column("max_schools", sa.Integer, nullable=False, server_default="5"),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime,
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    op.create_table(
        "node_assignments",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column(
            "node_id",
            sa.Integer,
            sa.ForeignKey("nodes.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "school_id",
            sa.Integer,
            sa.ForeignKey("schools.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("assigned_at", sa.DateTime, server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("school_id", name="uq_node_assignments_school"),
    )


def downgrade() -> None:
    op.drop_table("node_assignments")
    op.drop_table("nodes")
