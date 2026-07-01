"""market — shop_items, user_inventory

Revision ID: tenant_0006_market
Revises: tenant_0005_parent
Create Date: 2026-05-24
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "tenant_0006_market"
down_revision: Union[str, None] = "tenant_0005_parent"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "shop_items",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("school_id", sa.Integer, sa.ForeignKey("schools.id", ondelete="CASCADE"), nullable=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("price", sa.Integer, nullable=False),
        sa.Column("item_type", sa.String(50), nullable=False),
        sa.Column("rarity", sa.String(50), nullable=False, server_default="common"),
        sa.Column("stock", sa.Integer, nullable=True),
        sa.Column("image_path", sa.String(255), nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("is_physical", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("per_user_limit", sa.Integer, nullable=True),
        sa.Column("is_archived", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("is_upgradable", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("upgrade_price", sa.Integer, nullable=True),
        sa.Column("available_from", sa.DateTime, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_shop_items_school_id", "shop_items", ["school_id"])
    op.create_index("ix_shop_items_item_type", "shop_items", ["item_type"])
    op.create_index("ix_shop_items_is_active", "shop_items", ["is_active"])

    op.create_table(
        "user_inventory",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("item_id", sa.Integer, sa.ForeignKey("shop_items.id", ondelete="CASCADE"), nullable=False),
        sa.Column("quantity", sa.Integer, nullable=False, server_default="1"),
        sa.Column("is_equipped", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("is_issued", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("issued_at", sa.DateTime, nullable=True),
        sa.Column("purchased_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_user_inventory_user_id", "user_inventory", ["user_id"])
    op.create_index("ix_user_inventory_item_id", "user_inventory", ["item_id"])
    op.create_index("ix_user_inventory_is_issued", "user_inventory", ["is_issued"])


def downgrade() -> None:
    op.drop_table("user_inventory")
    op.drop_table("shop_items")
