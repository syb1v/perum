"""Org endpoints must reject unauthenticated/invalid requests (no DB needed).

These paths short-circuit in the auth dependency before any DB query, so they
run without a live Postgres.
"""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_orgs_require_auth():
    assert client.get("/api/organizations").status_code == 401


def test_orgs_reject_garbage_token():
    resp = client.get("/api/organizations", headers={"Authorization": "Bearer not.a.jwt"})
    assert resp.status_code == 401


def test_login_route_mounted():
    # Missing body -> 422 validation (proves the route exists without touching DB).
    assert client.post("/api/auth/login").status_code == 422
