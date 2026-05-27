"""Prometheus-метрики ядра (Фаза 9, observability). Текст в формате exposition
рендерится из control-БД при каждом скрейпе — без внешних зависимостей.

Prometheus скребёт `perum_core:3000/metrics` напрямую по внутренней сети (минуя
Caddy). В проде путь стоит закрыть по сети/доступу.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException, status
from fastapi.responses import PlainTextResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import get_db
from app.models import OrgAdmin, Organization, Release, School

router = APIRouter()


def _check_metrics_token(authorization: str | None, x_metrics_token: str | None) -> None:
    """Если METRICS_TOKEN задан — требуем его (Bearer или X-Metrics-Token).
    Пусто (dev) — открыто. Prometheus передаёт токен в scrape-конфиге."""
    token = get_settings().METRICS_TOKEN.strip()
    if not token:
        return
    provided = x_metrics_token or ""
    if authorization and authorization.lower().startswith("bearer "):
        provided = authorization[7:]
    if provided != token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "metrics token required")


def _esc(v: str) -> str:
    return v.replace("\\", "\\\\").replace('"', '\\"')


@router.get("/metrics", response_class=PlainTextResponse)
async def metrics(
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
    x_metrics_token: str | None = Header(default=None),
) -> str:
    _check_metrics_token(authorization, x_metrics_token)
    lines: list[str] = []

    def gauge(name: str, help_: str, samples: list[tuple[str, float]]):
        lines.append(f"# HELP {name} {help_}")
        lines.append(f"# TYPE {name} gauge")
        for labels, value in samples:
            lines.append(f"{name}{labels} {value}")

    org_rows = (await db.execute(select(Organization.status, func.count()).group_by(Organization.status))).all()
    gauge("perum_organizations", "Организации по статусу",
          [(f'{{status="{_esc(s)}"}}', c) for s, c in org_rows] or [('{status="none"}', 0)])

    school_rows = (await db.execute(select(School.status, func.count()).group_by(School.status))).all()
    gauge("perum_schools", "Школьные стеки по статусу",
          [(f'{{status="{_esc(s)}"}}', c) for s, c in school_rows] or [('{status="none"}', 0)])

    org_admins = await db.scalar(select(func.count(OrgAdmin.id))) or 0
    gauge("perum_org_admins", "Администраторы организаций", [("", org_admins)])

    releases = await db.scalar(select(func.count(Release.id))) or 0
    gauge("perum_releases", "Опубликованные релизы (всего)", [("", releases)])

    cur = (
        await db.execute(select(Release).where(Release.is_current.is_(True)).limit(1))
    ).scalar_one_or_none()
    gauge("perum_current_release_info", "Текущий релиз (channel, version) = 1",
          [(f'{{channel="{_esc(cur.channel)}",version="{_esc(cur.version_tag)}"}}', 1)] if cur else [('{channel="none",version="none"}', 0)])

    gauge("perum_up", "Контрол-плейн жив", [("", 1)])
    return "\n".join(lines) + "\n"
