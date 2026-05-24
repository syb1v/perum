"""Market logic (Phase 7), ported from the legacy market service.

Catalog browse, purchase with livki (balance + stock + per-user-limit checks,
writes a Transaction), inventory, and avatar/background equip/unequip. All
school-scoped; purchases/equips act on the caller's own user.
"""

from __future__ import annotations

from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ShopItem, Transaction, User, UserInventory

EQUIPPABLE = {"avatar", "background"}


def _item_dict(i: ShopItem) -> dict:
    return {
        "id": i.id,
        "name": i.name,
        "description": i.description,
        "price": i.price,
        "item_type": i.item_type,
        "rarity": i.rarity,
        "stock": i.stock,
        "image_path": i.image_path,
        "is_active": i.is_active,
        "per_user_limit": i.per_user_limit,
        "is_upgradable": i.is_upgradable,
        "upgrade_price": i.upgrade_price,
        "upgrade_bundle_id": None,
        "available_from": i.available_from.isoformat() if i.available_from else None,
    }


def _inv_dict(entry: UserInventory, item: ShopItem) -> dict:
    return {
        "id": entry.id,
        "item_id": entry.item_id,
        "quantity": entry.quantity,
        "is_equipped": entry.is_equipped,
        "upgrade_bg_url": None,
        "upgrade_pattern_url": None,
        "upgrade_skin": None,
        "purchased_at": entry.purchased_at.isoformat() if entry.purchased_at else None,
        "is_issued": entry.is_issued,
        "issued_at": entry.issued_at.isoformat() if entry.issued_at else None,
        "item": _item_dict(item),
    }


async def get_catalog(
    db: AsyncSession,
    school_id: int,
    item_type: str | None = None,
    rarity: str | None = None,
    min_price: int | None = None,
    max_price: int | None = None,
    skip: int = 0,
    limit: int = 50,
) -> list[dict]:
    # Items for this school OR global (school_id IS NULL), active and not archived.
    stmt = (
        select(ShopItem)
        .where(
            ((ShopItem.school_id == school_id) | (ShopItem.school_id.is_(None))),
            ShopItem.is_active.is_(True),
            ShopItem.is_archived.is_(False),
        )
        .order_by(ShopItem.price)
        .offset(skip)
        .limit(limit)
    )
    if item_type:
        stmt = stmt.where(ShopItem.item_type == item_type)
    if rarity:
        stmt = stmt.where(ShopItem.rarity == rarity)
    if min_price is not None:
        stmt = stmt.where(ShopItem.price >= min_price)
    if max_price is not None:
        stmt = stmt.where(ShopItem.price <= max_price)
    now = datetime.utcnow()
    rows = (await db.execute(stmt)).scalars().all()
    return [_item_dict(i) for i in rows if not i.available_from or i.available_from <= now]


async def _get_item(db: AsyncSession, school_id: int, item_id: int) -> ShopItem:
    item = (
        await db.execute(
            select(ShopItem).where(
                ShopItem.id == item_id,
                ((ShopItem.school_id == school_id) | (ShopItem.school_id.is_(None))),
            )
        )
    ).scalar_one_or_none()
    if item is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Товар не найден")
    return item


async def get_item_detail(db: AsyncSession, school_id: int, item_id: int) -> dict:
    item = await _get_item(db, school_id, item_id)
    return {**_item_dict(item), "created_at": item.created_at.isoformat() if item.created_at else None}


async def purchase_item(db: AsyncSession, school_id: int, user: User, item_id: int) -> dict:
    item = await _get_item(db, school_id, item_id)
    if not item.is_active or item.is_archived:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Товар снят с продажи")
    if item.available_from and item.available_from > datetime.utcnow():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Товар ещё не поступил в продажу")
    if (user.balance or 0) < item.price:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Недостаточно ливок. Нужно: {item.price}, у вас: {user.balance or 0}",
        )
    if item.stock is not None and item.stock <= 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Товар закончился")

    owned = await db.scalar(
        select(func.count())
        .select_from(UserInventory)
        .where(UserInventory.user_id == user.id, UserInventory.item_id == item_id)
    )
    if item.item_type != "gift":
        if owned:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Вы уже приобрели этот предмет")
    elif item.per_user_limit is not None and owned >= item.per_user_limit:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Лимит покупок этого товара: {item.per_user_limit}")

    new_balance = (user.balance or 0) - item.price
    await db.execute(update(User).where(User.id == user.id).values(balance=new_balance))
    if item.stock is not None:
        await db.execute(update(ShopItem).where(ShopItem.id == item_id).values(stock=item.stock - 1))
    entry = UserInventory(user_id=user.id, item_id=item_id)
    db.add(entry)
    await db.flush()
    db.add(Transaction(
        school_id=school_id, user_id=user.id, amount=-item.price, balance_after=new_balance,
        type="purchase", reason=f"Покупка: {item.name}", related_id=entry.id, created_by=user.id,
    ))
    await db.commit()
    return {
        "success": True,
        "message": f"Вы купили «{item.name}»!",
        "item_name": item.name,
        "price": item.price,
        "new_balance": new_balance,
        "inventory_id": entry.id,
    }


async def get_inventory(db: AsyncSession, user: User) -> list[dict]:
    rows = (
        await db.execute(
            select(UserInventory, ShopItem)
            .join(ShopItem, ShopItem.id == UserInventory.item_id)
            .where(UserInventory.user_id == user.id)
            .order_by(UserInventory.purchased_at.desc())
        )
    ).all()
    return [_inv_dict(entry, item) for entry, item in rows]


async def _inv_entry(db: AsyncSession, user_id: int, inventory_id: int) -> tuple[UserInventory, ShopItem]:
    row = (
        await db.execute(
            select(UserInventory, ShopItem)
            .join(ShopItem, ShopItem.id == UserInventory.item_id)
            .where(UserInventory.id == inventory_id, UserInventory.user_id == user_id)
        )
    ).first()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Предмет не найден в инвентаре")
    return row


async def _unequip_type(db: AsyncSession, user_id: int, item_type: str) -> None:
    sub = select(ShopItem.id).where(ShopItem.item_type == item_type)
    await db.execute(
        update(UserInventory)
        .where(UserInventory.user_id == user_id, UserInventory.item_id.in_(sub))
        .values(is_equipped=False)
    )


async def equip_item(db: AsyncSession, user: User, inventory_id: int) -> dict:
    entry, item = await _inv_entry(db, user.id, inventory_id)
    if item.item_type not in EQUIPPABLE:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Этот предмет нельзя надеть")
    await _unequip_type(db, user.id, item.item_type)
    await db.execute(update(UserInventory).where(UserInventory.id == inventory_id).values(is_equipped=True))
    if item.item_type == "avatar":
        await db.execute(update(User).where(User.id == user.id).values(avatar_url=item.image_path))
    await db.commit()
    return {"success": True, "message": f"Вы надели «{item.name}»", "item_name": item.name, "is_equipped": True}


async def unequip_item(db: AsyncSession, user: User, item_type: str) -> dict:
    if item_type not in EQUIPPABLE:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Можно снять только аватар или фон")
    await _unequip_type(db, user.id, item_type)
    if item_type == "avatar":
        await db.execute(update(User).where(User.id == user.id).values(avatar_url=None))
    await db.commit()
    names = {"avatar": "аватар", "background": "фон"}
    return {"success": True, "message": f"Вы сняли {names[item_type]}", "item_name": names[item_type], "is_equipped": False}


async def get_transactions(db: AsyncSession, user: User, skip: int = 0, limit: int = 100) -> list[dict]:
    rows = (
        await db.execute(
            select(Transaction)
            .where(Transaction.user_id == user.id)
            .order_by(Transaction.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
    ).scalars().all()
    return [
        {
            "id": t.id,
            "amount": t.amount,
            "balance_after": t.balance_after,
            "type": t.type,
            "reason": t.reason,
            "created_at": t.created_at.isoformat() if t.created_at else None,
        }
        for t in rows
    ]


async def set_default_avatar(db: AsyncSession, user: User, avatar_url: str | None) -> dict:
    await _unequip_type(db, user.id, "avatar")  # a default avatar replaces any equipped market avatar
    await db.execute(update(User).where(User.id == user.id).values(avatar_url=avatar_url))
    await db.commit()
    return {"success": True, "avatar_url": avatar_url}
