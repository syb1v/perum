"""R3 (tenant-сторона): отправитель телеметрии. Проверяем guard'ы без БД/сети
(сбор метрик требует БД и проверяется интеграционно)."""

import asyncio

import app.telemetry as t


def test_send_once_noop_without_token(monkeypatch):
    # Нет токена → выходим без сетевого вызова и без обращения к БД.
    monkeypatch.setattr(t.get_settings(), "TELEMETRY_TOKEN", "")
    asyncio.run(t.send_once())


def test_loop_disabled_without_token(monkeypatch):
    # Петля при пустом токене завершается сразу (не уходит в sleep на 5с).
    monkeypatch.setattr(t.get_settings(), "TELEMETRY_TOKEN", "")
    asyncio.run(asyncio.wait_for(t.telemetry_loop(), timeout=2))


def test_loop_disabled_with_zero_interval(monkeypatch):
    monkeypatch.setattr(t.get_settings(), "TELEMETRY_TOKEN", "tok")
    monkeypatch.setattr(t.get_settings(), "TELEMETRY_INTERVAL_S", 0)
    asyncio.run(asyncio.wait_for(t.telemetry_loop(), timeout=2))
