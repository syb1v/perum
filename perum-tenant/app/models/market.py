"""Market models (Phase 7).

Core student-facing shop: items priced in livki and per-user inventory with an
equipped flag. The legacy gift-upgrade / physical-delivery machinery is omitted
for now (admin-heavy, not part of the core buy→own→equip loop) — the columns
that the API response exposes are kept so the copied frontend renders.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


class ShopItem(Base):
    __tablename__ = "shop_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    school_id: Mapped[int | None] = mapped_column(
        ForeignKey("schools.id", ondelete="CASCADE"), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    price: Mapped[int] = mapped_column(Integer, nullable=False)
    item_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    rarity: Mapped[str] = mapped_column(String(50), nullable=False, default="common")
    stock: Mapped[int | None] = mapped_column(Integer, nullable=True)
    image_path: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, index=True)
    is_physical: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    per_user_limit: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_archived: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_upgradable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    upgrade_price: Mapped[int | None] = mapped_column(Integer, nullable=True)
    available_from: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)

    inventory_entries: Mapped[list["UserInventory"]] = relationship(back_populates="item")


class UserInventory(Base):
    __tablename__ = "user_inventory"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    item_id: Mapped[int] = mapped_column(
        ForeignKey("shop_items.id", ondelete="CASCADE"), nullable=False, index=True
    )
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    is_equipped: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_issued: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, index=True)
    issued_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    purchased_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)

    item: Mapped[ShopItem] = relationship(back_populates="inventory_entries")
