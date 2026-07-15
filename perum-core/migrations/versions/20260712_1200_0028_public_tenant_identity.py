"""Stable public tenant identity and indexed discovery domains.

Revision ID: 0028_public_tenant_identity
Revises: 0027_school_node_indexes
"""

from collections.abc import Sequence
from uuid import uuid4

import sqlalchemy as sa
from alembic import op

revision: str = "0028_public_tenant_identity"
down_revision: str | None = "0027_school_node_indexes"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("organizations", sa.Column("public_id", sa.Uuid(), nullable=True))
    op.add_column("schools", sa.Column("public_id", sa.Uuid(), nullable=True))
    op.add_column(
        "school_domains",
        sa.Column("is_primary", sa.Boolean(), nullable=False, server_default=sa.false()),
    )

    conn = op.get_bind()
    for table_name in ("organizations", "schools"):
        table = sa.table(table_name, sa.column("id", sa.Integer()), sa.column("public_id", sa.Uuid()))
        for row in conn.execute(sa.select(table.c.id).where(table.c.public_id.is_(None))):
            conn.execute(table.update().where(table.c.id == row.id).values(public_id=uuid4()))

    organizations = sa.table(
        "organizations",
        sa.column("id", sa.Integer()),
        sa.column("domain", sa.String()),
        sa.column("status", sa.String()),
    )
    schools = sa.table(
        "schools",
        sa.column("id", sa.Integer()),
        sa.column("org_id", sa.Integer()),
        sa.column("subdomain", sa.String()),
        sa.column("status", sa.String()),
    )
    domains = sa.table(
        "school_domains",
        sa.column("school_id", sa.Integer()),
        sa.column("domain", sa.String()),
        sa.column("domain_type", sa.String()),
        sa.column("status", sa.String()),
        sa.column("is_primary", sa.Boolean()),
    )
    rows = conn.execute(
        sa.select(schools.c.id, schools.c.subdomain, schools.c.status, organizations.c.domain, organizations.c.status)
        .join(organizations, schools.c.org_id == organizations.c.id)
        .where(schools.c.subdomain.is_not(None), organizations.c.domain.is_not(None))
    )
    for school_id, subdomain, school_status, org_domain, org_status in rows:
        host = f"{subdomain.strip().lower()}.{org_domain.strip().lower().rstrip('.')}"
        existing = conn.execute(sa.select(domains.c.school_id).where(domains.c.domain == host)).first()
        if existing is not None and existing.school_id != school_id:
            raise RuntimeError(f"School domain {host} belongs to another school")
        if existing is None:
            conn.execute(
                domains.insert().values(
                    school_id=school_id,
                    domain=host,
                    domain_type="subdomain",
                    status="active" if school_status == org_status == "active" else "pending_dns",
                    is_primary=True,
                )
            )
        else:
            conn.execute(domains.update().where(domains.c.domain == host).values(is_primary=True))

    with op.batch_alter_table("organizations") as batch_op:
        batch_op.alter_column("public_id", existing_type=sa.Uuid(), nullable=False)
    with op.batch_alter_table("schools") as batch_op:
        batch_op.alter_column("public_id", existing_type=sa.Uuid(), nullable=False)
    op.create_index("ix_organizations_public_id", "organizations", ["public_id"], unique=True)
    op.create_index("ix_schools_public_id", "schools", ["public_id"], unique=True)
    op.create_index(
        "uq_school_domains_primary",
        "school_domains",
        ["school_id"],
        unique=True,
        postgresql_where=sa.text("is_primary"),
        sqlite_where=sa.text("is_primary = 1"),
    )


def downgrade() -> None:
    op.drop_index("uq_school_domains_primary", table_name="school_domains")
    op.drop_index("ix_schools_public_id", table_name="schools")
    op.drop_index("ix_organizations_public_id", table_name="organizations")
    op.drop_column("school_domains", "is_primary")
    op.drop_column("schools", "public_id")
    op.drop_column("organizations", "public_id")
