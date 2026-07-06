"""0027_school_node_indexes — indexes and constraint for production stability.

Revision ID: 0027
Revises: 0026_school_status_message
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0027_school_node_indexes"
down_revision: str | None = "0026_school_status_message"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # C1: index on School.status — every list/filter queries by status
    op.create_index(op.f("ix_schools_status"), "schools", ["status"])

    # C3: prevent duplicate subdomains within an org
    op.create_unique_constraint("uq_schools_org_subdomain", "schools", ["org_id", "subdomain"])

    # H1: index on Node.status — bulk operations filter by status
    op.create_index(op.f("ix_nodes_status"), "nodes", ["status"])


def downgrade() -> None:
    op.drop_index(op.f("ix_nodes_status"), table_name="nodes")
    op.drop_constraint("uq_schools_org_subdomain", "schools", type_="unique")
    op.drop_index(op.f("ix_schools_status"), table_name="schools")
