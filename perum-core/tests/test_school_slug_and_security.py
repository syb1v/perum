"""P0-аудит фиксы: валидация slug школы, защита платформенного хоста в Caddy,
анти-спуфинг X-Forwarded-For в rate-limit. Чистая логика, без сети и БД."""

import asyncio

import pytest
from pydantic import ValidationError
from starlette.requests import Request

from app.core.ratelimit import _client_ip
from app.routers.schools import SchoolCreate
from app.schemas.organization import RESERVED_SLUGS
from app.services.caddy_admin import CaddyAdmin, CaddyAdminError


# --- поддомен школы валидируется так же строго, как slug организации ---

@pytest.mark.parametrize("subdomain", ["acme", "school45", "kuban-edu-1", "lyceum-7"])
def test_school_valid_slugs_accepted(subdomain: str):
    assert SchoolCreate(subdomain=subdomain, name="Школа").subdomain == subdomain


def test_school_slug_lowercased_and_trimmed():
    assert SchoolCreate(subdomain="  Lyceum-7  ", name="Школа").subdomain == "lyceum-7"


@pytest.mark.parametrize("slug", sorted(RESERVED_SLUGS))
def test_school_reserved_slugs_rejected(slug: str):
    # 'admin'/'api'/... перехватили бы платформенный хост через Caddy-маршрут.
    with pytest.raises(ValidationError):
        SchoolCreate(subdomain=slug, name="Школа")


@pytest.mark.parametrize("slug", ["ab", "1school", "school_1", "school.1", "-school", "ШКОЛА", "a" * 41])
def test_school_malformed_slugs_rejected(slug: str):
    with pytest.raises(ValidationError):
        SchoolCreate(subdomain=slug, name="Школа")


# --- Caddy add_route не отдаёт платформенные хосты на стек школы ---

@pytest.mark.parametrize("host", ["perum.local", "admin.perum.local", "www.perum.local"])
def test_caddy_add_route_rejects_platform_hosts(host: str):
    # PUBLIC_BASE_DOMAIN по умолчанию = perum.local (см. config). Гард срабатывает
    # ДО любого сетевого вызова, поэтому отсутствие Caddy в тесте не мешает.
    with pytest.raises(CaddyAdminError, match="зарезервирован"):
        asyncio.run(CaddyAdmin().add_route("sch-evil", host, "school_evil_app:3000"))


# --- rate-limit берёт реальный клиентский IP (последний хоп), не подделанный первый ---

def _req(xff: str | None, peer: str = "10.0.0.9") -> Request:
    headers = [(b"x-forwarded-for", xff.encode())] if xff is not None else []
    return Request({"type": "http", "headers": headers, "client": (peer, 12345)})


def test_client_ip_uses_last_xff_hop_not_spoofable_first():
    # Клиент подделал первый элемент; Caddy дописал реальный IP в конец.
    assert _client_ip(_req("1.2.3.4, 203.0.113.7")) == "203.0.113.7"


def test_client_ip_single_value():
    assert _client_ip(_req("203.0.113.7")) == "203.0.113.7"


def test_client_ip_falls_back_to_peer_without_xff():
    assert _client_ip(_req(None)) == "10.0.0.9"
