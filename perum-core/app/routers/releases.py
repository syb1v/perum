"""Канал релизов (platform_admin) — основа OTA-обновлений (см. ARCH_ORG_NODE.md).

platform_admin публикует релиз (тег образа + changelog); узлы орг сравнивают
`release_tag` своих школ с текущим релизом и обновляются по кнопке org_admin.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.models import Release

router = APIRouter()


class ReleaseCreate(BaseModel):
    version_tag: str
    image: str | None = None
    changelog: str | None = None
    channel: str = "stable"
    make_current: bool = True


def _release_dict(r: Release) -> dict:
    return {
        "id": r.id,
        "channel": r.channel,
        "version_tag": r.version_tag,
        "image": r.image,
        "changelog": r.changelog,
        "is_current": r.is_current,
        "published_at": r.published_at.isoformat() if r.published_at else None,
    }


@router.get("")
async def list_releases(channel: str | None = None, db: AsyncSession = Depends(get_db)) -> dict:
    stmt = select(Release).order_by(Release.published_at.desc())
    if channel:
        stmt = stmt.where(Release.channel == channel)
    rows = (await db.execute(stmt)).scalars().all()
    return {"releases": [_release_dict(r) for r in rows]}


@router.get("/current")
async def current_release(channel: str = "stable", db: AsyncSession = Depends(get_db)) -> dict:
    rel = (
        await db.execute(
            select(Release).where(Release.channel == channel, Release.is_current.is_(True)).limit(1)
        )
    ).scalar_one_or_none()
    return {"release": _release_dict(rel) if rel else None}


@router.post("", status_code=status.HTTP_201_CREATED)
async def publish_release(payload: ReleaseCreate, db: AsyncSession = Depends(get_db)) -> dict:
    dup = (
        await db.execute(
            select(Release).where(Release.channel == payload.channel, Release.version_tag == payload.version_tag)
        )
    ).scalar_one_or_none()
    if dup is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "релиз с таким version_tag в этом канале уже есть")

    if payload.make_current:
        await db.execute(
            update(Release).where(Release.channel == payload.channel).values(is_current=False)
        )
    rel = Release(
        channel=payload.channel,
        version_tag=payload.version_tag,
        image=payload.image or payload.version_tag,
        changelog=payload.changelog,
        is_current=payload.make_current,
    )
    db.add(rel)
    await db.commit()
    await db.refresh(rel)
    return _release_dict(rel)
