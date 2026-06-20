"""Новости ядра. platform_admin пишет/редактирует/удаляет новости и адресует их
всем (is_global) или выбранным организациям; публикация рассылается как
уведомление org_admin (services.notifications.fanout_news). org_admin читает
свою ленту (GET /feed) — global ИЛИ адресованные его org."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import require_org_admin, require_platform_admin
from app.models import NewsPost, NewsTarget, Notification, OrgAdmin, PlatformAdmin
from app.services.notifications import fanout_news

router = APIRouter()


class NewsCreate(BaseModel):
    title: str = Field(min_length=2, max_length=255)
    body: str = Field(min_length=1)
    is_global: bool = False
    org_ids: list[int] = Field(default_factory=list)
    pinned: bool = False


class NewsPatch(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=255)
    body: str | None = Field(default=None, min_length=1)
    is_global: bool | None = None
    org_ids: list[int] | None = None
    pinned: bool | None = None
    is_published: bool | None = None


def _news_dict(n: NewsPost, target_count: int) -> dict:
    return {
        "id": n.id,
        "title": n.title,
        "body": n.body,
        "is_global": n.is_global,
        "is_published": n.is_published,
        "pinned": n.pinned,
        "target_count": target_count,
        "created_at": n.created_at.isoformat() if n.created_at else None,
        "updated_at": n.updated_at.isoformat() if n.updated_at else None,
    }


async def _target_counts(db: AsyncSession, news_ids: list[int]) -> dict[int, int]:
    if not news_ids:
        return {}
    rows = (
        await db.execute(
            select(NewsTarget.news_id, func.count(NewsTarget.id))
            .where(NewsTarget.news_id.in_(news_ids))
            .group_by(NewsTarget.news_id)
        )
    ).all()
    return {nid: cnt for nid, cnt in rows}


# --------------------------------------------------------------------------
# platform_admin
# --------------------------------------------------------------------------
@router.post("", status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_platform_admin)])
async def create_news(
    payload: NewsCreate,
    admin: PlatformAdmin = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    if not payload.is_global and not payload.org_ids:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "выберите организации или включите «всем»")
    news = NewsPost(
        title=payload.title.strip(),
        body=payload.body,
        is_global=payload.is_global,
        pinned=payload.pinned,
        author_id=admin.id,
    )
    db.add(news)
    await db.flush()  # нужен news.id для таргетов и фан-аута
    if not payload.is_global:
        for oid in set(payload.org_ids):
            db.add(NewsTarget(news_id=news.id, org_id=oid))
        await db.flush()
    delivered = await fanout_news(db, news)
    await db.commit()
    return {"id": news.id, "delivered": delivered}


@router.get("", dependencies=[Depends(require_platform_admin)])
async def list_news(db: AsyncSession = Depends(get_db)) -> dict:
    rows = (await db.execute(select(NewsPost).order_by(NewsPost.created_at.desc()))).scalars().all()
    counts = await _target_counts(db, [n.id for n in rows])
    return {"news": [_news_dict(n, counts.get(n.id, 0)) for n in rows]}


@router.patch("/{news_id}", dependencies=[Depends(require_platform_admin)])
async def update_news(news_id: int, payload: NewsPatch, db: AsyncSession = Depends(get_db)) -> dict:
    news = await db.get(NewsPost, news_id)
    if news is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "новость не найдена")
    if payload.title is not None:
        news.title = payload.title.strip()
    if payload.body is not None:
        news.body = payload.body
    if payload.pinned is not None:
        news.pinned = payload.pinned
    if payload.is_published is not None:
        news.is_published = payload.is_published
    if payload.is_global is not None:
        news.is_global = payload.is_global
    if payload.org_ids is not None:
        await db.execute(delete(NewsTarget).where(NewsTarget.news_id == news.id))
        if not news.is_global:
            for oid in set(payload.org_ids):
                db.add(NewsTarget(news_id=news.id, org_id=oid))
    await db.commit()
    count = (await _target_counts(db, [news.id])).get(news.id, 0)
    return _news_dict(news, count)


@router.delete("/{news_id}", dependencies=[Depends(require_platform_admin)])
async def delete_news(news_id: int, db: AsyncSession = Depends(get_db)) -> dict:
    news = await db.get(NewsPost, news_id)
    if news is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "новость не найдена")
    await db.delete(news)
    await db.commit()
    return {"ok": True}


# --------------------------------------------------------------------------
# org_admin
# --------------------------------------------------------------------------
@router.get("/feed", dependencies=[Depends(require_org_admin)])
async def news_feed(
    admin: OrgAdmin = Depends(require_org_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    targeted = select(NewsTarget.news_id).where(NewsTarget.org_id == admin.org_id)
    q = (
        select(NewsPost)
        .where(
            NewsPost.is_published.is_(True),
            or_(NewsPost.is_global.is_(True), NewsPost.id.in_(targeted)),
        )
        .order_by(NewsPost.pinned.desc(), NewsPost.created_at.desc())
    )
    rows = (await db.execute(q)).scalars().all()
    return {
        "news": [
            {
                "id": n.id,
                "title": n.title,
                "body": n.body,
                "pinned": n.pinned,
                "created_at": n.created_at.isoformat() if n.created_at else None,
            }
            for n in rows
        ]
    }
