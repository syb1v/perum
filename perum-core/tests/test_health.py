"""Smoke tests for the control plane app — no DB connection required.

These hit endpoints that don't touch the database. `/health/db` is
intentionally not tested here because it requires a live Postgres; that
belongs to integration tests under docker-compose.
"""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_ok():
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_root_reports_service():
    resp = client.get("/")
    assert resp.status_code == 200
    body = resp.json()
    assert body["service"] == "perum-core"
    assert "docs" in body


def test_openapi_served():
    resp = client.get("/openapi.json")
    assert resp.status_code == 200
    assert "/api/organizations" in resp.json()["paths"]
