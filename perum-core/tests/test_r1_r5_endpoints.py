"""R1 (заморозка/редактирование/управление org_admin) и R5 (управление админами
школ): регистрация роутов в OpenAPI + auth-гейты. БД не требуется — проверяем,
что эндпоинты существуют и закрыты нужной ролью (зависимость auth срабатывает до
обращения к БД)."""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _paths() -> dict:
    return client.get("/openapi.json").json()["paths"]


def test_r1_org_routes_registered():
    p = _paths()
    assert "patch" in p["/api/organizations/{org_id}"]
    assert "/api/organizations/{org_id}/suspend" in p
    assert "/api/organizations/{org_id}/unsuspend" in p
    assert "/api/organizations/{org_id}/org-admins/{admin_id}" in p
    assert "/api/organizations/{org_id}/org-admins/{admin_id}/reset-password" in p


def test_r1_school_routes_registered():
    p = _paths()
    assert "patch" in p["/api/schools/{school_id}"]
    assert "/api/schools/{school_id}/suspend" in p
    assert "/api/schools/{school_id}/unsuspend" in p


def test_r5_school_admin_routes_registered():
    p = _paths()
    assert "/api/schools/{school_id}/admins" in p
    assert "/api/schools/{school_id}/admins/{uid}" in p
    assert "/api/schools/{school_id}/admins/{uid}/reset-password" in p


def test_org_lifecycle_requires_platform_admin():
    # Роутер организаций целиком под require_platform_admin → без токена отказ.
    assert client.post("/api/organizations/1/suspend").status_code in (401, 403)
    assert client.post("/api/organizations/1/unsuspend").status_code in (401, 403)
    assert client.patch("/api/organizations/1", json={"name": "X"}).status_code in (401, 403)
    assert client.get("/api/organizations/1/org-admins").status_code in (401, 403)


def test_school_management_requires_org_admin():
    # Роутер школ под require_org_admin → без токена отказ.
    assert client.get("/api/schools/1/admins").status_code in (401, 403)
    assert client.post("/api/schools/1/admins", json={"email": "a@b.co"}).status_code in (401, 403)
    assert client.post("/api/schools/1/suspend").status_code in (401, 403)
    assert client.patch("/api/schools/1", json={"name": "X"}).status_code in (401, 403)
