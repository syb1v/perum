"""Market endpoints, mounted at /api/market (legacy-compatible paths).

Browse/buy/inventory/equip for the logged-in user. Open to any authenticated
user; purchases act on the caller's own balance and inventory.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import get_current_user
from app.models import User
from app.modules.market import service
from app.modules.school_admin.service import resolve_school_id

router = APIRouter()


async def _school(user: User, db: AsyncSession) -> int:
    return await resolve_school_id(user, db)


@router.get("/items")
async def items(
    item_type: str | None = None,
    rarity: str | None = None,
    min_price: int | None = None,
    max_price: int | None = None,
    skip: int = 0,
    limit: int = 50,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list:
    return await service.get_catalog(
        db, await _school(user, db), item_type, rarity, min_price, max_price, skip, limit
    )


@router.get("/items/{item_id}")
async def item_detail(
    item_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> dict:
    return await service.get_item_detail(db, await _school(user, db), item_id)


@router.post("/buy/{item_id}")
async def buy(
    item_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> dict:
    return await service.purchase_item(db, await _school(user, db), user, item_id)


@router.get("/inventory")
async def inventory(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> list:
    return await service.get_inventory(db, user)


@router.post("/equip/{inventory_id}")
async def equip(
    inventory_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> dict:
    return await service.equip_item(db, user, inventory_id)


@router.post("/unequip/{item_type}")
async def unequip(
    item_type: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> dict:
    return await service.unequip_item(db, user, item_type)


@router.get("/transactions")
async def transactions(
    skip: int = 0, limit: int = 100, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> list:
    return await service.get_transactions(db, user, skip, limit)
