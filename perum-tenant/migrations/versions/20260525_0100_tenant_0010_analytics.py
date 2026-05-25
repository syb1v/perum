"""analytics — page_visits

Revision ID: tenant_0010_analytics
Revises: tenant_0009_news
Create Date: 2026-05-25
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "tenant_0010_analytics"
down_revision: Union[str, None] = "tenant_0009_news"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "page_visits",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("school_id", sa.Integer, sa.ForeignKey("schools.id", ondelete="CASCADE"), nullable=True),
        sa.Column("session_identifier", sa.String(100), nullable=False),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("path", sa.String(500), nullable=False),
        sa.Column("referrer", sa.String(500), nullable=True),
        sa.Column("user_agent", sa.Text, nullable=True),
        sa.Column("is_mobile", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_page_visits_school_id", "page_visits", ["school_id"])
    op.create_index("ix_page_visits_session_identifier", "page_visits", ["session_identifier"])
    op.create_index("ix_page_visits_user_id", "page_visits", ["user_id"])
    op.create_index("ix_page_visits_created_at", "page_visits", ["created_at"])


def downgrade() -> None:
    op.drop_table("page_visits")
