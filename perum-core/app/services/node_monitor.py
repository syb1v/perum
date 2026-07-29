"""Снятие живых метрик одной ноды (ping + health) — общий код для фоновой
монитор-петли (24/7) и для on-demand обновления при просмотре раздела
«Инфраструктура» (UI поллит метрики каждые ~2с). Источник истины статуса ноды —
эта функция (её зовёт ядро), фронт статус не пересчитывает."""

from __future__ import annotations

import time
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Node
from app.services.remote_node_client import RemoteNodeClient

# Статусы, для которых имеет смысл опрашивать воркер (установлена и в работе/выводе).
MONITORABLE = ("active", "offline", "draining")


async def _reconcile_landing_status(node: Node, landings: list[dict], db: AsyncSession) -> None:
    """Привести `Organization.landing_status` в соответствие с фактом на ноде.

    Воркер восстанавливает маршруты лендингов сам (resync при старте), но раньше
    не сообщал об этом ядру — однажды выставленный `failed` жил вечно, хотя сайт
    уже отвечал. Наблюдение идёт по домену: он привязан к орг и не зависит от
    переименования slug.
    """
    from app.models import Organization

    observed = {
        str(item.get("domain") or "").lower(): bool(item.get("running")) and bool(item.get("routed"))
        for item in landings
        if item.get("domain")
    }
    if not observed:
        return

    orgs = (await db.execute(
        select(Organization).where(Organization.node_id == node.id, Organization.domain.isnot(None))
    )).scalars().all()

    changed = False
    for org in orgs:
        healthy = observed.get((org.domain or "").lower())
        if healthy is None:
            continue
        desired = "active" if healthy else "failed"
        if org.landing_status != desired:
            org.landing_status = desired
            changed = True
    if changed:
        await db.commit()


async def refresh_node_metrics(node: Node, db: AsyncSession, client: RemoteNodeClient | None = None) -> None:
    """Один цикл мониторинга ОДНОЙ ноды: латентность (whoami) + загрузка (health,
    cpu/ram/disk). Пишет node.last_* и статус active/offline. Коммитит сам."""
    if node.status not in MONITORABLE:
        return
    client = client or RemoteNodeClient(timeout=6.0)
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    t0 = time.monotonic()
    alive = await client.ping(node)
    ping_ms = int((time.monotonic() - t0) * 1000)

    if not alive:
        node.last_ping_ms = None
        if node.status == "active":
            node.status = "offline"
        await db.commit()
        return

    node.last_heartbeat = now
    node.last_ping_ms = ping_ms
    if node.status == "offline":
        node.status = "active"
    try:
        h = await client.get_health(node)
        node.last_cpu_percent = h.get("cpu_percent")
        node.last_ram_used_mb = h.get("ram_used_mb")
        node.last_ram_total_mb = h.get("ram_total_mb")
        node.last_disk_used_gb = h.get("disk_used_gb")
        node.last_disk_total_gb = h.get("disk_total_gb")
        node.metrics_at = now
        if h.get("agent_version"):
            node.agent_version = h["agent_version"]
        await _reconcile_landing_status(node, h.get("landings") or [], db)
    except Exception:  # noqa: BLE001 — health не критичен, ping уже подтвердил связь
        pass
    await db.commit()
