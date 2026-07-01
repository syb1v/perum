"""Лиды лендинга (R4): публичный POST /api/contact, защита GET, honeypot,
валидация, троттлинг. БД не требуется — проверяем пути, не пишущие в неё."""

from fastapi.testclient import TestClient

import app.routers.contact as contact
from app.main import app

client = TestClient(app)


def setup_function() -> None:
    contact._hits.clear()  # изоляция троттлинга между тестами


def test_contact_route_registered():
    paths = client.get("/openapi.json").json()["paths"]
    assert "/api/contact" in paths
    assert "post" in paths["/api/contact"]


def test_contact_list_requires_platform_admin():
    # GET закрыт require_platform_admin; без токена — отказ (не 200).
    resp = client.get("/api/contact")
    assert resp.status_code in (401, 403)


def test_contact_honeypot_silently_accepts_without_db():
    # Заполненный honeypot → молчаливый «успех», запись не создаётся (БД не трогаем).
    resp = client.post("/api/contact", json={"email": "bot@spam.tld", "website": "http://spam"})
    assert resp.status_code == 201
    assert resp.json() == {"ok": True}


def test_contact_validation_rejects_bad_email():
    resp = client.post("/api/contact", json={"email": "not-an-email"})
    assert resp.status_code == 422


def test_contact_throttle_after_limit():
    # Honeypot-путь тоже считается троттлингом и не пишет в БД — удобно для теста.
    for _ in range(contact._CONTACT_LIMIT):
        r = client.post("/api/contact", json={"email": "a@b.co", "website": "x"})
        assert r.status_code == 201
    blocked = client.post("/api/contact", json={"email": "a@b.co", "website": "x"})
    assert blocked.status_code == 429
