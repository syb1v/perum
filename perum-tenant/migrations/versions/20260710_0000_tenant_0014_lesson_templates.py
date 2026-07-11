"""lesson templates

Revision ID: tenant_0014_lesson_templates
Revises: tenant_0013_misc
Create Date: 2026-07-10
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "tenant_0014_lesson_templates"
down_revision: Union[str, None] = "tenant_0013_misc"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "lesson_templates",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("school_id", sa.Integer, sa.ForeignKey("schools.id", ondelete="CASCADE"), nullable=False),
        sa.Column("class_id", sa.Integer, sa.ForeignKey("classes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("subject_id", sa.Integer, sa.ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("lesson_date", sa.Date, nullable=False),
        sa.Column("topic_id", sa.Integer, sa.ForeignKey("topics.id", ondelete="SET NULL"), nullable=True),
        sa.Column("work_type_id", sa.Integer, sa.ForeignKey("work_types.id", ondelete="SET NULL"), nullable=True),
        sa.Column("updated_by", sa.Integer, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("class_id", "subject_id", "lesson_date", name="uq_lesson_template"),
    )
    op.create_index("ix_lesson_templates_school_id", "lesson_templates", ["school_id"])
    op.create_index("ix_lesson_templates_class_id", "lesson_templates", ["class_id"])
    op.create_index("ix_lesson_templates_subject_id", "lesson_templates", ["subject_id"])


def downgrade() -> None:
    op.drop_table("lesson_templates")
