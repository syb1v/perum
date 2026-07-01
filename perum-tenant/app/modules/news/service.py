"""News logic (Phase 8), ported from the legacy news router.

School-scoped feed with per-user like/read flags and like/view counts, an
unread counter, and admin CRUD (drafts allowed via is_published). Media upload
itself is deferred (a JSON array of URLs is stored as-is).
"""

from __future__ import annotations

from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy import delete as sa_delete
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import News, NewsLike, NewsRead, User


def _author_name(u: User | None) -> str | None:
    if u is None:
        return None
    return f"{u.last_name or ''} {u.first_name or ''}".strip() or u.login


async def _counts(db: AsyncSession, news_ids: list[int]) -> tuple[dict, dict]:
    if not news_ids:
        return {}, {}
    likes = dict(
        (
            await db.execute(
                select(NewsLike.news_id, func.count(NewsLike.user_id))
                .where(NewsLike.news_id.in_(news_ids))
                .group_by(NewsLike.news_id)
            )
        ).all()
    )
    reads = dict(
        (
            await db.execute(
                select(NewsRead.news_id, func.count(NewsRead.user_id))
                .where(NewsRead.news_id.in_(news_ids))
                .group_by(NewsRead.news_id)
            )
        ).all()
    )
    return likes, reads


async def _my_sets(db: AsyncSession, user_id: int, news_ids: list[int]) -> tuple[set, set]:
    if not news_ids:
        return set(), set()
    liked = set(
        (
            await db.execute(
                select(NewsLike.news_id).where(NewsLike.user_id == user_id, NewsLike.news_id.in_(news_ids))
            )
        ).scalars().all()
    )
    read = set(
        (
            await db.execute(
                select(NewsRead.news_id).where(NewsRead.user_id == user_id, NewsRead.news_id.in_(news_ids))
            )
        ).scalars().all()
    )
    return liked, read


async def _serialize(db: AsyncSession, user: User, rows: list[News]) -> list[dict]:
    ids = [n.id for n in rows]
    likes, reads = await _counts(db, ids)
    my_liked, my_read = await _my_sets(db, user.id, ids)
    author_ids = {n.author_id for n in rows if n.author_id}
    authors = (
        {u.id: u for u in (await db.execute(select(User).where(User.id.in_(author_ids)))).scalars().all()}
        if author_ids
        else {}
    )
    out = []
    for n in rows:
        out.append({
            "id": n.id,
            "title": n.title,
            "content": n.content,
            "author_name": _author_name(authors.get(n.author_id)),
            "media": n.media,
            "is_published": n.is_published,
            "likes_count": likes.get(n.id, 0),
            "views_count": reads.get(n.id, 0),
            "is_liked": n.id in my_liked,
            "is_read": n.id in my_read,
            "created_at": str(n.created_at) if n.created_at else None,
        })
    return out


# ---- student feed ----
async def get_feed(db: AsyncSession, school_id: int, user: User, skip: int = 0, limit: int = 20) -> dict:
    rows = (
        await db.execute(
            select(News)
            .where(News.school_id == school_id, News.is_published == 1)
            .order_by(News.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
    ).scalars().all()
    return {"news": await _serialize(db, user, rows)}


async def unread_count(db: AsyncSession, school_id: int, user: User) -> dict:
    n = (
        await db.scalar(
            select(func.count(News.id))
            .outerjoin(NewsRead, (NewsRead.news_id == News.id) & (NewsRead.user_id == user.id))
            .where(News.school_id == school_id, News.is_published == 1, NewsRead.news_id.is_(None))
        )
    ) or 0
    return {"count": n, "unread_count": n}


async def toggle_like(db: AsyncSession, user: User, news_id: int) -> dict:
    news = await db.get(News, news_id)
    if news is None or not news.is_published:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Новость не найдена")
    like = await db.scalar(
        select(NewsLike).where(NewsLike.news_id == news_id, NewsLike.user_id == user.id)
    )
    if like is not None:
        await db.delete(like)
        liked = False
    else:
        db.add(NewsLike(news_id=news_id, user_id=user.id))
        liked = True
    await db.commit()
    return {"status": "ok", "liked": liked}


async def mark_read(db: AsyncSession, user: User, news_id: int) -> dict:
    news = await db.get(News, news_id)
    if news is None or not news.is_published:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Новость не найдена")
    exists = await db.scalar(
        select(NewsRead).where(NewsRead.news_id == news_id, NewsRead.user_id == user.id)
    )
    if exists is None:
        db.add(NewsRead(news_id=news_id, user_id=user.id))
        await db.commit()
    return {"status": "ok"}


# ---- admin ----
async def admin_list(db: AsyncSession, school_id: int, user: User, skip: int = 0, limit: int = 20) -> dict:
    rows = (
        await db.execute(
            select(News)
            .where(News.school_id == school_id)
            .order_by(News.created_at.desc())
            .offset(skip)
            .limit(limit + 1)
        )
    ).scalars().all()
    has_more = len(rows) > limit
    return {"news": await _serialize(db, user, rows[:limit]), "has_more": has_more}


async def create(db: AsyncSession, school_id: int, user: User, title: str, content: str, is_published: int, media: str | None) -> dict:
    news = News(
        school_id=school_id, title=title, content=content, author_id=user.id,
        is_published=is_published, media=media,
    )
    db.add(news)
    await db.commit()
    await db.refresh(news)
    return {"status": "ok", "id": news.id}


async def _get_owned(db: AsyncSession, school_id: int, news_id: int) -> News:
    news = (
        await db.execute(select(News).where(News.id == news_id, News.school_id == school_id))
    ).scalar_one_or_none()
    if news is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Новость не найдена")
    return news


async def update(db: AsyncSession, school_id: int, news_id: int, **fields) -> dict:
    news = await _get_owned(db, school_id, news_id)
    for key in ("title", "content", "is_published", "media"):
        if fields.get(key) is not None:
            setattr(news, key, fields[key])
    news.updated_at = datetime.utcnow()
    await db.commit()
    return {"status": "ok"}


async def delete(db: AsyncSession, school_id: int, news_id: int) -> dict:
    news = await _get_owned(db, school_id, news_id)
    await db.execute(sa_delete(NewsLike).where(NewsLike.news_id == news_id))
    await db.execute(sa_delete(NewsRead).where(NewsRead.news_id == news_id))
    await db.delete(news)
    await db.commit()
    return {"status": "ok"}
