"""Рассылка уведомлений организаторам (per-org_admin). Источники — публикация
новости (fanout_news) и ответ поддержки (notify_ticket_reply). Создаёт строки
Notification активным OrgAdmin адресатов; коммит — на стороне вызывающего."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import NewsPost, NewsTarget, Notification, OrgAdmin, SupportTicket


async def _active_admins_for_orgs(db: AsyncSession, org_ids: list[int]) -> list[OrgAdmin]:
    if not org_ids:
        return []
    rows = (
        await db.execute(
            select(OrgAdmin).where(OrgAdmin.org_id.in_(org_ids), OrgAdmin.is_active.is_(True))
        )
    ).scalars().all()
    return list(rows)


async def fanout_news(db: AsyncSession, news: NewsPost) -> int:
    """Создать уведомление каждому активному org_admin адресатов новости.

    Адресаты: все организации, если news.is_global, иначе из news_targets.
    Возвращает число созданных уведомлений. Не коммитит."""
    if news.is_global:
        org_ids = [oid for (oid,) in (await db.execute(select(OrgAdmin.org_id).distinct())).all()]
    else:
        org_ids = [
            oid for (oid,) in (
                await db.execute(select(NewsTarget.org_id).where(NewsTarget.news_id == news.id))
            ).all()
        ]

    admins = await _active_admins_for_orgs(db, org_ids)
    snippet = (news.body or "")[:280]
    for admin in admins:
        db.add(Notification(
            org_admin_id=admin.id,
            type="news",
            title=news.title,
            body=snippet,
            ref_id=news.id,
        ))
    return len(admins)


async def notify_ticket_reply(db: AsyncSession, ticket: SupportTicket) -> int:
    """Уведомить активных org_admin организации об ответе поддержки в тикете.
    Не коммитит."""
    admins = await _active_admins_for_orgs(db, [ticket.org_id])
    for admin in admins:
        db.add(Notification(
            org_admin_id=admin.id,
            type="support",
            title=f"Ответ поддержки: {ticket.subject}",
            body=None,
            ref_id=ticket.id,
        ))
    return len(admins)
