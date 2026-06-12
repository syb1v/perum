"""Admin-маркет (school_admin/director): CRUD товаров, загрузка картинок,
история покупок, складская статистика. Закрывает «MarketManagement.tsx звал
несуществующий бэкенд» (AUDIT_2026-06-12, 2.9).

Примечание: пулы апгрейд-ассетов/бандлов подарков и массовая ZIP-загрузка
(вкладки кастомизации подарков) требуют новых моделей и пока НЕ реализованы —
основной маркет (товары/история/склад) функционален.
"""

from __future__ import annotations

import os
import re
import secrets
from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import require_admin
from app.models import ShopItem, Transaction, User, UserInventory
from app.modules.school_admin.service import resolve_school_id

router = APIRouter()

UPLOAD_DIR = os.environ.get("APP_DATA_DIR", "/app/data") + "/uploads/market"
_ALLOWED_EXT = {".png", ".jpg", ".jpeg", ".gif", ".webp"}
_SAFE_NAME = re.compile(r"^[A-Za-z0-9_.-]+$")


def _admin_item_dict(i: ShopItem) -> dict:
    return {
        "id": i.id, "name": i.name, "description": i.description, "price": i.price,
        "item_type": i.item_type, "rarity": i.rarity, "stock": i.stock,
        "image_path": i.image_path, "per_user_limit": i.per_user_limit,
        "is_active": i.is_active, "is_physical": i.is_physical, "is_archived": i.is_archived,
        "is_upgradable": i.is_upgradable, "upgrade_price": i.upgrade_price, "upgrade_bundle_id": None,
        "available_from": i.available_from.isoformat() if i.available_from else None,
        "created_at": i.created_at.isoformat() if i.created_at else None,
    }


def _parse_dt(v) -> datetime | None:
    if not v:
        return None
    try:
        return datetime.fromisoformat(str(v).replace("Z", "+00:00").replace("+00:00", ""))
    except ValueError:
        return None


class ShopItemPayload(BaseModel):
    name: str | None = None
    description: str | None = None
    price: int | None = None
    item_type: str | None = None
    rarity: str | None = None
    stock: int | None = None
    image_path: str | None = None
    per_user_limit: int | None = None
    is_active: bool | None = None
    is_physical: bool | None = None
    is_upgradable: bool | None = None
    upgrade_price: int | None = None
    available_from: str | None = None
    # принимаем, но игнорируем (пулы апгрейдов не реализованы)
    upgrade_bundle_id: int | None = None


async def _get_item(item_id: int, school_id: int, db: AsyncSession) -> ShopItem:
    item = await db.get(ShopItem, item_id)
    if item is None or item.school_id != school_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Товар не найден")
    return item


@router.get("/items")
async def list_items(
    skip: int = 0, limit: int = Query(50, ge=1, le=200), include_archived: bool = False,
    user: User = Depends(require_admin), db: AsyncSession = Depends(get_db),
) -> dict:
    school_id = await resolve_school_id(user, db)
    stmt = select(ShopItem).where(ShopItem.school_id == school_id)
    if not include_archived:
        stmt = stmt.where(ShopItem.is_archived.is_(False))
    stmt = stmt.order_by(ShopItem.id.desc()).offset(skip).limit(limit)
    rows = (await db.execute(stmt)).scalars().all()
    return {"items": [_admin_item_dict(i) for i in rows], "has_more": len(rows) == limit}


@router.post("/items", status_code=status.HTTP_201_CREATED)
async def create_item(payload: ShopItemPayload, user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)) -> dict:
    school_id = await resolve_school_id(user, db)
    if not payload.name or payload.price is None or not payload.item_type:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "нужны name, price, item_type")
    item = ShopItem(
        school_id=school_id, name=payload.name, description=payload.description,
        price=payload.price, item_type=payload.item_type, rarity=payload.rarity or "common",
        stock=payload.stock, image_path=payload.image_path, per_user_limit=payload.per_user_limit,
        is_active=payload.is_active if payload.is_active is not None else True,
        is_physical=bool(payload.is_physical),
        is_upgradable=bool(payload.is_upgradable), upgrade_price=payload.upgrade_price,
        available_from=_parse_dt(payload.available_from), is_archived=False,
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return _admin_item_dict(item)


@router.put("/items/{item_id}")
async def update_item(item_id: int, payload: ShopItemPayload, user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)) -> dict:
    school_id = await resolve_school_id(user, db)
    item = await _get_item(item_id, school_id, db)
    data = payload.model_dump(exclude_unset=True)
    for field in ("name", "description", "price", "item_type", "rarity", "stock", "image_path",
                  "per_user_limit", "is_active", "is_physical", "is_upgradable", "upgrade_price"):
        if field in data:
            setattr(item, field, data[field])
    if "available_from" in data:
        item.available_from = _parse_dt(data["available_from"])
    await db.commit()
    await db.refresh(item)
    return _admin_item_dict(item)


@router.delete("/items/{item_id}")
async def archive_item(item_id: int, user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)) -> dict:
    school_id = await resolve_school_id(user, db)
    item = await _get_item(item_id, school_id, db)
    item.is_archived = True
    item.is_active = False
    await db.commit()
    return {"success": True, "id": item_id}


@router.post("/items/{item_id}/restore")
async def restore_item(item_id: int, user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)) -> dict:
    school_id = await resolve_school_id(user, db)
    item = await _get_item(item_id, school_id, db)
    item.is_archived = False
    item.is_active = True
    await db.commit()
    return {"success": True, "id": item_id}


@router.post("/items/upload")
async def upload_image(file: UploadFile = File(...), user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)) -> dict:
    await resolve_school_id(user, db)  # гейт роли (require_admin) + единый стиль
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in _ALLOWED_EXT:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "разрешены только изображения png/jpg/gif/webp")
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    name = f"{secrets.token_hex(8)}{ext}"
    path = os.path.join(UPLOAD_DIR, name)
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "файл больше 5 МБ")
    with open(path, "wb") as buf:
        buf.write(content)
    # Публичный URL под /api → через Caddy попадает в стек школы (см. market/router.py).
    return {"success": True, "image_path": f"/api/market/images/{name}"}


@router.get("/transactions")
async def list_transactions(
    skip: int = 0, limit: int = Query(100, ge=1, le=500),
    search: str | None = None, item_type: str | None = None,
    user: User = Depends(require_admin), db: AsyncSession = Depends(get_db),
) -> dict:
    school_id = await resolve_school_id(user, db)
    stmt = (
        select(Transaction, User, ShopItem)
        .join(User, Transaction.user_id == User.id, isouter=True)
        .join(UserInventory, Transaction.related_id == UserInventory.id, isouter=True)
        .join(ShopItem, UserInventory.item_id == ShopItem.id, isouter=True)
        .where(Transaction.school_id == school_id, Transaction.type == "purchase")
    )
    if item_type:
        stmt = stmt.where(ShopItem.item_type == item_type)
    if search:
        like = f"%{search}%"
        stmt = stmt.where(or_(
            User.login.ilike(like), User.first_name.ilike(like),
            User.last_name.ilike(like), ShopItem.name.ilike(like),
        ))
    stmt = stmt.order_by(Transaction.created_at.desc()).offset(skip).limit(limit)
    rows = (await db.execute(stmt)).all()
    txs = [{
        "id": t.id, "amount": t.amount, "reason": t.reason,
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "item_type": (item.item_type if item else None),
        "item_name": (item.name if item else None),
        "user": {
            "id": u.id if u else None, "login": u.login if u else "—",
            "first_name": u.first_name if u else None, "last_name": u.last_name if u else None,
        },
    } for t, u, item in rows]
    return {"transactions": txs, "has_more": len(rows) == limit}


@router.get("/inventory-stats")
async def inventory_stats(user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)) -> dict:
    school_id = await resolve_school_id(user, db)
    issued = func.coalesce(func.sum(case((UserInventory.is_issued.is_(True), 1), else_=0)), 0)
    rows = (await db.execute(
        select(
            ShopItem.id, ShopItem.name, ShopItem.item_type, ShopItem.price, ShopItem.stock,
            func.count(UserInventory.id).label("purchased"),
            issued.label("issued"),
        )
        .join(UserInventory, UserInventory.item_id == ShopItem.id, isouter=True)
        .where(ShopItem.school_id == school_id, ShopItem.is_archived.is_(False))
        .group_by(ShopItem.id)
        .order_by(ShopItem.id.desc())
    )).all()
    stats = [{
        "id": r.id, "name": r.name, "item_type": r.item_type, "price": r.price,
        "stock_remaining": r.stock, "total_purchased": int(r.purchased or 0),
        "total_issued": int(r.issued or 0), "total_unissued": int((r.purchased or 0) - (r.issued or 0)),
    } for r in rows]
    return {"stats": stats}
