"""parent ↔ student link — parent_students

Revision ID: tenant_0005_parent
Revises: tenant_0004_journal
Create Date: 2026-05-24
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "tenant_0005_parent"
down_revision: Union[str, None] = "tenant_0004_journal"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "parent_students",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("parent_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("student_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("parent_id", "student_id", name="uq_parent_student"),
    )
    op.create_index("ix_parent_students_parent_id", "parent_students", ["parent_id"])
    op.create_index("ix_parent_students_student_id", "parent_students", ["student_id"])


def downgrade() -> None:
    op.drop_index("ix_parent_students_student_id", table_name="parent_students")
    op.drop_index("ix_parent_students_parent_id", table_name="parent_students")
    op.drop_table("parent_students")
