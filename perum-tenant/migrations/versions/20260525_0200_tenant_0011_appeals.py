"""appeals — grade_appeals

Revision ID: tenant_0011_appeals
Revises: tenant_0010_analytics
Create Date: 2026-05-25
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "tenant_0011_appeals"
down_revision: Union[str, None] = "tenant_0010_analytics"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "grade_appeals",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("school_id", sa.Integer, sa.ForeignKey("schools.id", ondelete="CASCADE"), nullable=True),
        sa.Column("student_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("grade_id", sa.Integer, sa.ForeignKey("grades.id", ondelete="CASCADE"), nullable=False),
        sa.Column("teacher_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("reason", sa.Text, nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("teacher_comment", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column("resolved_at", sa.DateTime, nullable=True),
    )
    op.create_index("ix_grade_appeals_school_id", "grade_appeals", ["school_id"])
    op.create_index("ix_grade_appeals_student_id", "grade_appeals", ["student_id"])
    op.create_index("ix_grade_appeals_grade_id", "grade_appeals", ["grade_id"])
    op.create_index("ix_grade_appeals_teacher_id", "grade_appeals", ["teacher_id"])
    op.create_index("ix_grade_appeals_status", "grade_appeals", ["status"])


def downgrade() -> None:
    op.drop_table("grade_appeals")
