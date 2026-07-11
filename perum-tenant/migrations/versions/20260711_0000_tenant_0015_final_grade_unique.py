"""final grade uniqueness

Revision ID: tenant_0015_final_grade_unique
Revises: tenant_0014_lesson_templates
Create Date: 2026-07-11
"""

from typing import Sequence, Union

from alembic import op

revision: str = "tenant_0015_final_grade_unique"
down_revision: Union[str, None] = "tenant_0014_lesson_templates"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "DELETE FROM final_grades WHERE id IN ("
        "SELECT id FROM (SELECT id, ROW_NUMBER() OVER ("
        "PARTITION BY school_id, student_id, subject_id, class_id, period_id "
        "ORDER BY CASE WHEN updated_at IS NULL THEN 1 ELSE 0 END, updated_at DESC, id DESC) "
        "AS row_num FROM final_grades) duplicates "
        "WHERE row_num > 1)"
    )
    with op.batch_alter_table("final_grades") as batch_op:
        batch_op.create_unique_constraint(
            "uq_final_grade_period",
            ["school_id", "student_id", "subject_id", "class_id", "period_id"],
        )


def downgrade() -> None:
    with op.batch_alter_table("final_grades") as batch_op:
        batch_op.drop_constraint("uq_final_grade_period", type_="unique")
