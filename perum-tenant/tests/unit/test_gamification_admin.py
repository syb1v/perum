"""R6-полнота: admin-CRUD маркета/квестов/биржи. Проверяем регистрацию роутов
в OpenAPI и что они закрыты auth (require_admin) — без токена отказ, до БД."""

import pytest

pytest.importorskip("httpx")

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_admin_routes_registered():
    paths = client.get("/openapi.json").json()["paths"]
    for p in [
        "/api/quests", "/api/quests/{quest_id}",
        "/api/exchange/admin/settings", "/api/exchange/admin/windows",
        "/api/exchange/admin/investments", "/api/exchange/admin/investments/refund-all",
        "/api/exchange/admin/logs",
        "/api/admin/market/items", "/api/admin/market/transactions",
        "/api/admin/market/inventory-stats", "/api/admin/market/items/upload",
        "/api/market/images/{filename}",
    ]:
        assert p in paths, p


def test_quest_admin_requires_auth():
    for method, path in [("get", "/api/quests"), ("post", "/api/quests"),
                         ("get", "/api/exchange/admin/settings"),
                         ("get", "/api/admin/market/items"),
                         ("post", "/api/admin/market/items")]:
        r = client.request(method, path, json={})
        assert r.status_code in (401, 403), f"{method} {path} -> {r.status_code}"


def test_market_image_traversal_blocked():
    # public-эндпоинт, но защищён от path traversal/неизвестных файлов
    assert client.get("/api/market/images/..%2f..%2fetc%2fpasswd").status_code in (400, 404)
    assert client.get("/api/market/images/nope.png").status_code == 404
