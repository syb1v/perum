"""News endpoints. Two routers:
- student feed at /api/news (read/like/unread)
- admin CRUD at /api/admin/news (require_admin)
"""

from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import get_current_user, require_admin
from app.models import User
from app.modules.news import service
from app.modules.school_admin.service import resolve_school_id

router = APIRouter()        # mounted at /api/news
admin_router = APIRouter()  # mounted at /api/admin/news


async def _school(user: User, db: AsyncSession) -> int:
    return await resolve_school_id(user, db)


def _media_to_str(media: Any) -> str | None:
    if media is None or isinstance(media, str):
        return media
    return json.dumps(media, ensure_ascii=False)


class NewsCreate(BaseModel):
    title: str
    content: str
    is_published: int = 1
    media: Any = None


class NewsUpdate(BaseModel):
    title: str | None = None
    content: str | None = None
    is_published: int | None = None
    media: Any = None


# ---- student feed (literal routes before any /{id} to avoid capture) ----
@router.get("")
async def feed(
    skip: int = 0, limit: int = 20, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> dict:
    return await service.get_feed(db, await _school(user, db), user, skip, limit)


@router.get("/unread-count")
async def unread_count(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> dict:
    return await service.unread_count(db, await _school(user, db), user)


@router.post("/{news_id}/like")
async def like(news_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> dict:
    return await service.toggle_like(db, user, news_id)


@router.post("/{news_id}/read")
async def read(news_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> dict:
    return await service.mark_read(db, user, news_id)


# ---- admin CRUD ----
@admin_router.get("")
async def admin_list(
    skip: int = 0, limit: int = 20, user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)
) -> dict:
    return await service.admin_list(db, await _school(user, db), user, skip, limit)


@admin_router.post("")
async def admin_create(
    payload: NewsCreate, user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)
) -> dict:
    return await service.create(
        db, await _school(user, db), user, payload.title, payload.content,
        payload.is_published, _media_to_str(payload.media),
    )


@admin_router.put("/{news_id}")
async def admin_update(
    news_id: int, payload: NewsUpdate, user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)
) -> dict:
    return await service.update(
        db, await _school(user, db), news_id,
        title=payload.title, content=payload.content,
        is_published=payload.is_published, media=_media_to_str(payload.media),
    )


@admin_router.delete("/{news_id}")
async def admin_delete(
    news_id: int, user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)
) -> dict:
    return await service.delete(db, await _school(user, db), news_id)
