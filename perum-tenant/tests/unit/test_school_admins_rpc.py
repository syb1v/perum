"""R5 (tenant-сторона): внутренний RPC управления админами школы. Проверяем
гард telemetry-token и pure-хелперы без TestClient/БД (tenant-образ не тянет httpx)."""

import asyncio

import pytest
from fastapi import HTTPException

import app.internal.router as ir


def test_telemetry_token_guard(monkeypatch):
    monkeypatch.setattr(ir.settings, "TELEMETRY_TOKEN", "s3cret")
    # Верный токен — проходит (None == no raise).
    assert asyncio.run(ir._require_telemetry_token("s3cret")) is None
    # Неверный и пустой — 401.
    with pytest.raises(HTTPException):
        asyncio.run(ir._require_telemetry_token("wrong"))
    with pytest.raises(HTTPException):
        asyncio.run(ir._require_telemetry_token(None))


def test_telemetry_guard_rejects_when_unset(monkeypatch):
    # Пустой серверный токен → любой запрос отклоняется (не открываем RPC).
    monkeypatch.setattr(ir.settings, "TELEMETRY_TOKEN", "")
    with pytest.raises(HTTPException):
        asyncio.run(ir._require_telemetry_token("anything"))


def test_admin_dict_full_name_split():
    class _U:
        id = 7
        login = "z@school.ru"
        email = "z@school.ru"
        first_name = "Иван"
        last_name = "Петров"
        is_active = True
        must_change_password = True

    d = ir._admin_dict(_U())
    assert d["full_name"] == "Иван Петров"
    assert d["login"] == "z@school.ru"
    assert d["must_change_password"] is True
