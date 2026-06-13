"""Закрытие находок аудита иерархии (lifecycle/billing/isolation): регистрация
новых эндпоинтов + их auth-гейты, сериализация локов, выбор RPC-заголовка,
подтверждение purge. Без БД (DB-backed логика проверяется отдельно)."""

import asyncio
from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.main import app
from app.core.locks import keyed_lock, org_create_key, school_key
from app.services.school_provisioner import _rpc_headers

client = TestClient(app)
GARBAGE = {"Authorization": "Bearer not.a.jwt"}


# --- новые эндпоинты смонтированы и закрыты auth ---

def test_org_self_billing_requires_org_admin():
    # /api/org/billing — мягкий гард (пускает приостановленную орг), но без токена → 401.
    assert client.get("/api/org/billing").status_code == 401
    assert client.get("/api/org/billing", headers=GARBAGE).status_code == 401


def test_receivables_requires_platform_admin():
    assert client.get("/api/billing/receivables").status_code == 401
    assert client.get("/api/billing/receivables", headers=GARBAGE).status_code == 401


def test_set_plan_requires_platform_admin():
    assert client.put("/api/organizations/acme/billing", json={"plan": "basic"}).status_code == 401


def test_school_purge_requires_org_admin():
    # purge/confirm обрабатываются ПОСЛЕ auth — без токена остаётся 401.
    assert client.delete("/api/schools/1?purge=true&confirm=foo").status_code == 401


# --- keyed_lock сериализует одинаковый ключ и НЕ блокирует разные ключи ---

def test_keyed_lock_serializes_same_key():
    order: list = []

    async def worker(n: int, hold: float):
        async with keyed_lock("same"):
            order.append(("start", n))
            await asyncio.sleep(hold)
            order.append(("end", n))

    async def run():
        await asyncio.gather(worker(1, 0.05), worker(2, 0.0))

    asyncio.run(run())
    # Первый захвативший лок проходит критическую секцию целиком до второго.
    assert order == [("start", 1), ("end", 1), ("start", 2), ("end", 2)]


def test_keyed_lock_distinct_keys_concurrent():
    order: list = []

    async def worker(key: str, n: int):
        async with keyed_lock(key):
            order.append(("start", n))
            await asyncio.sleep(0.02)
            order.append(("end", n))

    async def run():
        await asyncio.gather(worker("a", 1), worker("b", 2))

    asyncio.run(run())
    # Разные ключи не сериализуются → обе секции стартуют до того, как любая завершится.
    assert order[0][0] == "start" and order[1][0] == "start"


def test_lock_keys_are_distinct():
    assert school_key(1) != school_key(2)
    assert org_create_key(1) != school_key(1)


# --- выбор заголовка RPC: отдельный токен предпочтительнее, иначе legacy-telemetry ---

def test_rpc_headers_sends_both_when_internal_present():
    # Ядро знает оба токена → шлёт оба (старый образ читает telemetry, новый —
    # internal). Изоляцию обеспечивает сам тенант (новый игнорирует telemetry).
    spec = SimpleNamespace(internal_rpc_token="rpc-xyz", telemetry_token="tel-abc")
    assert _rpc_headers(spec) == {"X-Telemetry-Token": "tel-abc", "X-Internal-Token": "rpc-xyz"}


def test_rpc_headers_telemetry_only_for_legacy():
    spec = SimpleNamespace(internal_rpc_token=None, telemetry_token="tel-abc")
    assert _rpc_headers(spec) == {"X-Telemetry-Token": "tel-abc"}
