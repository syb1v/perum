"""Prometheus-метрики ядра (Фаза 9, observability). Текст в формате exposition
рендерится из control-БД при каждом скрейпе — без внешних зависимостей.

Prometheus скребёт `perum_core:3000/metrics` напрямую по внутренней сети (минуя
Caddy). В проде путь стоит закрыть по сети/доступу.
"""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, Header, HTTPException, status
from fastapi.responses import PlainTextResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import get_db
from app.models import OrgAdmin, Organization, Release, School, SchoolMetric
from app.services.stats import is_online

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

    # Живость и нагрузка школ из снимков телеметрии (разрез по орг/школе).
    now = datetime.utcnow()
    sm_rows = (
        await db.execute(
            select(School.slug, Organization.slug, SchoolMetric)
            .join(Organization, School.org_id == Organization.id)
            .outerjoin(SchoolMetric, SchoolMetric.school_id == School.id)
            .where(School.status != "archived")
        )
    ).all()
    up_samples, students_samples, users_samples = [], [], []
    for school_slug, org_slug, metric in sm_rows:
        lbl = f'{{org="{_esc(org_slug)}",school="{_esc(school_slug)}"}}'
        up_samples.append((lbl, 1 if is_online(metric, now) else 0))
        students_samples.append((lbl, metric.students if metric else 0))
        users_samples.append((lbl, metric.users_total if metric else 0))
    gauge("perum_school_up", "Школа жива (свежий heartbeat) = 1", up_samples or [('{org="none",school="none"}', 0)])
    gauge("perum_school_students", "Учеников в школе (последний снимок)", students_samples or [('{org="none",school="none"}', 0)])
    gauge("perum_school_users", "Пользователей в школе (последний снимок)", users_samples or [('{org="none",school="none"}', 0)])

    return "\n".join(lines) + "\n"
