"""Cloudflare DNS manager — авто-управление A-записями поддоменов школ.

Архитектура (задача 5):
  - Один CLOUDFLARE_API_TOKEN на весь PERUM (platform_settings).
  - Каждый орг-домен = отдельная зона в CF (добавляется вручную через CF Dashboard).
  - При создании школы: POST /zones/{zone_id}/dns_records → A-запись на IP ноды.
  - При удалении/заморозке: DELETE /zones/{zone_id}/dns_records/{record_id}.
  - DNS-only (серые облака) — трафик напрямую на ноду, TLS за Caddy на ноде.

Fallback: если CLOUDFLARE_API_TOKEN не задан — ручной режим (подсказки в UI).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

import httpx

from app.core.config import get_settings

logger = logging.getLogger("perum.dns")

CF_API_BASE = "https://api.cloudflare.com/client/v4"


@dataclass
class DnsRecord:
    """Представление DNS-записи для UI."""
    name: str          # school1
    fqdn: str          # school1.acme.ru
    type: str          # A
    content: str       # IP ноды
    node_name: str     # имя ноды
    cf_record_id: str | None = None  # ID записи в CF (если авто)
    status: str = "ok"  # ok | pending | error


@dataclass
class DnsSyncResult:
    synced: int = 0
    deleted: int = 0
    errors: list[str] = field(default_factory=list)
    records: list[DnsRecord] = field(default_factory=list)


class DnsManager:
    """Абстракция над Cloudflare DNS API. Поддерживает авто-режим (CF API)
    и ручной (только подсказки в UI)."""

    def __init__(self) -> None:
        self._settings = get_settings()
        self._token: str = self._settings.CLOUDFLARE_API_TOKEN
        self._enabled: bool = self._settings.CLOUDFLARE_DNS_ENABLED and bool(self._token)
        self._client: httpx.AsyncClient | None = None

    @property
    def is_auto(self) -> bool:
        return self._enabled

    async def _cf(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(
                base_url=CF_API_BASE,
                headers={
                    "Authorization": f"Bearer {self._token}",
                    "Content-Type": "application/json",
                },
                timeout=httpx.Timeout(15.0),
            )
        return self._client

    # ------------------------------------------------------------------
    # Zone management
    # ------------------------------------------------------------------

    async def find_zone(self, domain: str) -> dict[str, Any] | None:
        """Найти CF-зону по имени домена. Возвращает {id, name, status} или None."""
        if not self._enabled:
            return None
        try:
            cf = await self._cf()
            resp = await cf.get("/zones", params={"name": domain, "status": "active"})
            resp.raise_for_status()
            data = resp.json()
            zones = data.get("result", [])
            if zones:
                z = zones[0]
                return {"id": z["id"], "name": z["name"], "status": z["status"]}
            return None
        except Exception as exc:
            logger.warning("CF find_zone(%s) failed: %s", domain, exc)
            return None

    # ------------------------------------------------------------------
    # Record CRUD
    # ------------------------------------------------------------------

    async def create_record(
        self, zone_id: str, subdomain: str, domain: str, ip: str, node_name: str = "",
    ) -> DnsRecord:
        """Создать A-запись <subdomain>.<domain> → <ip>."""
        fqdn = f"{subdomain}.{domain}"
        record = DnsRecord(name=subdomain, fqdn=fqdn, type="A", content=ip, node_name=node_name)

        if not self._enabled:
            logger.info("DNS: manual mode — запись %s → %s (добавь вручную)", fqdn, ip)
            return record

        try:
            cf = await self._cf()
            resp = await cf.post(
                f"/zones/{zone_id}/dns_records",
                json={
                    "type": "A",
                    "name": subdomain,
                    "content": ip,
                    "ttl": 1,    # auto-TTL
                    "proxied": False,  # DNS-only, серое облако
                },
            )
            resp.raise_for_status()
            result = resp.json()
            if result.get("success"):
                record.cf_record_id = result["result"]["id"]
                logger.info("CF: создана A-запись %s → %s (id=%s)", fqdn, ip, record.cf_record_id)
            else:
                errors = result.get("errors", [])
                msg = "; ".join(e.get("message", str(e)) for e in errors) or "неизвестная ошибка CF"
                logger.error("CF: не удалось создать запись %s: %s", fqdn, msg)
                record.status = "error"
        except Exception as exc:
            logger.error("CF: create_record(%s) failed: %s", fqdn, exc)
            record.status = "error"

        return record

    async def delete_record(self, zone_id: str, cf_record_id: str) -> bool:
        """Удалить DNS-запись по её CF ID."""
        if not self._enabled or not cf_record_id:
            return False

        try:
            cf = await self._cf()
            resp = await cf.delete(f"/zones/{zone_id}/dns_records/{cf_record_id}")
            resp.raise_for_status()
            result = resp.json()
            ok = bool(result.get("success"))
            logger.info("CF: удалена запись %s — %s", cf_record_id, "ok" if ok else "fail")
            return ok
        except Exception as exc:
            logger.error("CF: delete_record(%s) failed: %s", cf_record_id, exc)
            return False

    async def list_records(self, zone_id: str, domain: str) -> list[DnsRecord]:
        """Список A-записей зоны (поддомены школ)."""
        if not self._enabled:
            return []

        try:
            cf = await self._cf()
            resp = await cf.get(
                f"/zones/{zone_id}/dns_records",
                params={"type": "A", "per_page": 500},
            )
            resp.raise_for_status()
            result = resp.json()
            records: list[DnsRecord] = []
            for r in result.get("result", []):
                name = r["name"].replace(f".{domain}", "")
                records.append(DnsRecord(
                    name=name,
                    fqdn=r["name"],
                    type=r["type"],
                    content=r["content"],
                    node_name="",
                    cf_record_id=r["id"],
                ))
            return records
        except Exception as exc:
            logger.error("CF: list_records(%s) failed: %s", zone_id, exc)
            return []

    # ------------------------------------------------------------------
    # Синхронизация орг: сопоставляет школы с DNS-записями
    # ------------------------------------------------------------------

    async def sync_org_dns(self, org: Any, db: Any) -> DnsSyncResult:
        """Синхронизировать DNS-записи организации: создать недостающие A-записи
        для школ, удалить лишние (без школ). Возвращает сводку."""
        from app.models import Node, School

        result = DnsSyncResult()
        if not self._enabled or not org.cf_zone_id:
            return result

        # Текущие DNS-записи в CF
        cf_records = await self.list_records(org.cf_zone_id, org.domain or "")
        cf_by_name = {r.name: r for r in cf_records}

        # Активные школы орг
        schools = (await db.execute(
            select(School).where(School.org_id == org.id, School.status.in_(["active", "suspended"]))
        )).scalars().all()

        # Для каждой школы: найти её ноду → IP, сверить с DNS
        from app.models import NodeAssignment
        for school in schools:
            if not school.subdomain:
                continue
            # Найти IP ноды школы
            node_ip = None
            node_name = ""
            a = await db.scalar(select(NodeAssignment).where(NodeAssignment.school_id == school.id))
            if a:
                node = await db.get(Node, a.node_id)
                if node:
                    node_ip = node.hostname
                    node_name = node.name

            if not node_ip:
                continue

            existing = cf_by_name.pop(school.subdomain, None)
            if existing and existing.content == node_ip:
                result.records.append(existing)
            else:
                record = await self.create_record(org.cf_zone_id, school.subdomain, org.domain, node_ip, node_name)
                result.records.append(record)
                result.synced += 1

        # Оставшиеся в cf_by_name — записи без школ (удаляем)
        for name, record in cf_by_name.items():
            if record.name in ("@", "www"):
                continue  # не трогаем корень и www
            if record.cf_record_id:
                await self.delete_record(org.cf_zone_id, record.cf_record_id)
                result.deleted += 1

        return result

    # ------------------------------------------------------------------
    # Ручной режим: генерирует записи для UI-подсказок
    # ------------------------------------------------------------------

    async def manual_records(self, org: Any, db: Any) -> DnsSyncResult:
        """Собрать DNS-записи для ручного ввода оператором."""
        from app.models import Node, NodeAssignment, School

        result = DnsSyncResult()
        schools = (await db.execute(
            select(School).where(School.org_id == org.id, School.status.in_(["active", "suspended"]))
        )).scalars().all()

        for school in schools:
            if not school.subdomain:
                continue
            a = await db.scalar(select(NodeAssignment).where(NodeAssignment.school_id == school.id))
            node_ip = ""
            node_name = ""
            if a:
                node = await db.get(Node, a.node_id)
                if node:
                    node_ip = node.hostname
                    node_name = node.name

            result.records.append(DnsRecord(
                name=school.subdomain,
                fqdn=f"{school.subdomain}.{org.domain}",
                type="A",
                content=node_ip,
                node_name=node_name,
                status="manual",
            ))

        return result


def get_dns_manager() -> DnsManager:
    return DnsManager()
