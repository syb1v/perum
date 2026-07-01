"""R5 (tenant-сторона): внутренний RPC управления админами школы. Проверяем
гард telemetry-token и pure-хелперы без TestClient/БД (tenant-образ не тянет httpx)."""

import asyncio

import pytest
from fastapi import HTTPException

import app.internal.router as ir


# Гард принимает оба заголовка: x_internal_token (новый) и x_telemetry_token (легаси).
# При прямом вызове передаём ОБА явно (иначе незаданный остаётся объектом Header()).

def test_legacy_telemetry_path(monkeypatch):
    # INTERNAL_RPC_TOKEN не задан → легаси-режим: пускает по telemetry-токену.
    monkeypatch.setattr(ir.settings, "INTERNAL_RPC_TOKEN", "")
    monkeypatch.setattr(ir.settings, "TELEMETRY_TOKEN", "s3cret")
    assert asyncio.run(ir._require_internal_token(x_internal_token=None, x_telemetry_token="s3cret")) is None
    with pytest.raises(HTTPException):
        asyncio.run(ir._require_internal_token(x_internal_token=None, x_telemetry_token="wrong"))
    with pytest.raises(HTTPException):
        asyncio.run(ir._require_internal_token(x_internal_token=None, x_telemetry_token=None))


def test_internal_token_path_isolates_from_telemetry(monkeypatch):
    # INTERNAL_RPC_TOKEN задан → принимается ТОЛЬКО он; telemetry-токен НЕ пускает
    # (это и есть изоляция #6).
    monkeypatch.setattr(ir.settings, "INTERNAL_RPC_TOKEN", "rpc1")
    monkeypatch.setattr(ir.settings, "TELEMETRY_TOKEN", "s3cret")
    assert asyncio.run(ir._require_internal_token(x_internal_token="rpc1", x_telemetry_token=None)) is None
    # telemetry-токен на /internal теперь отвергается:
    with pytest.raises(HTTPException):
        asyncio.run(ir._require_internal_token(x_internal_token=None, x_telemetry_token="s3cret"))
    # неверный internal — 401:
    with pytest.raises(HTTPException):
        asyncio.run(ir._require_internal_token(x_internal_token="wrong", x_telemetry_token="s3cret"))


def test_guard_rejects_when_all_unset(monkeypatch):
    # Ни одного серверного токена → любой запрос отклоняется (не открываем RPC).
    monkeypatch.setattr(ir.settings, "INTERNAL_RPC_TOKEN", "")
    monkeypatch.setattr(ir.settings, "TELEMETRY_TOKEN", "")
    with pytest.raises(HTTPException):
        asyncio.run(ir._require_internal_token(x_internal_token="anything", x_telemetry_token="anything"))


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
