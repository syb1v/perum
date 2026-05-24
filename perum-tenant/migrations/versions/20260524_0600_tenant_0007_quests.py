"""quests — quests, user_quests

Revision ID: tenant_0007_quests
Revises: tenant_0006_market
Create Date: 2026-05-24
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "tenant_0007_quests"
down_revision: Union[str, None] = "tenant_0006_market"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "quests",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("school_id", sa.Integer, sa.ForeignKey("schools.id", ondelete="CASCADE"), nullable=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("reward", sa.Integer, nullable=False, server_default="0"),
        sa.Column("quest_type", sa.String(50), nullable=False, server_default="positive_grades"),
        sa.Column("conditions", sa.Text, nullable=True),
        sa.Column("class_id", sa.Integer, sa.ForeignKey("classes.id", ondelete="SET NULL"), nullable=True),
        sa.Column("subject_id", sa.Integer, sa.ForeignKey("subjects.id", ondelete="SET NULL"), nullable=True),
        sa.Column("target_grades", sa.String(10), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="available"),
        sa.Column("expires_at", sa.DateTime, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_quests_school_id", "quests", ["school_id"])

    op.create_table(
        "user_quests",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("school_id", sa.Integer, sa.ForeignKey("schools.id", ondelete="CASCADE"), nullable=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("quest_id", sa.Integer, sa.ForeignKey("quests.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("progress", sa.Integer, nullable=False, server_default="0"),
        sa.Column("target", sa.Integer, nullable=False, server_default="0"),
        sa.Column("started_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column("last_updated", sa.DateTime, nullable=True),
        sa.Column("completed_at", sa.DateTime, nullable=True),
        sa.Column("reward_claimed", sa.Integer, nullable=False, server_default="0"),
    )
    op.create_index("ix_user_quests_school_id", "user_quests", ["school_id"])
    op.create_index("ix_user_quests_user_id", "user_quests", ["user_id"])
    op.create_index("ix_user_quests_quest_id", "user_quests", ["quest_id"])


def downgrade() -> None:
    op.drop_table("user_quests")
    op.drop_table("quests")
