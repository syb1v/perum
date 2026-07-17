"""R3 (tenant-сторона): отправитель телеметрии. Проверяем guard'ы без БД/сети
(сбор метрик требует БД и проверяется интеграционно)."""

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

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


def test_send_once_includes_deployment_snapshot(monkeypatch):
    settings = t.get_settings()
    monkeypatch.setattr(settings, "TELEMETRY_TOKEN", "token")
    monkeypatch.setattr(settings, "CONTROL_PLANE_URL", "https://core.example")
    monkeypatch.setattr(settings, "ORG_SLUG", "school")
    monkeypatch.setattr(settings, "SCHOOL_PUBLIC_ID", "f89929a3-1aca-4be4-adb2-f706dcb78b1b")
    monkeypatch.setattr(settings, "RELEASE_IMAGE", "tenant:release-a")
    monkeypatch.setattr(t, "collect_metrics", AsyncMock(return_value={"users_total": 1}))

    db = AsyncMock()
    db.scalar.return_value = 7

    class SessionContext:
        async def __aenter__(self):
            return db

        async def __aexit__(self, *_args):
            return None

    post = AsyncMock(return_value=SimpleNamespace(status_code=200, text=""))

    class ClientContext:
        async def __aenter__(self):
            return SimpleNamespace(post=post)

        async def __aexit__(self, *_args):
            return None

    monkeypatch.setattr(t, "SessionLocal", SessionContext)
    monkeypatch.setattr(t.httpx, "AsyncClient", lambda **_kwargs: ClientContext())

    asyncio.run(t.send_once())

    body = post.await_args.kwargs["json"]
    assert body["deployment_snapshot"] == {
        "schema_version": 1,
        "school_id": settings.SCHOOL_PUBLIC_ID,
        "release_image": "tenant:release-a",
        "scanner_ready": False,
        "realtime_ready": True,
        "push_registration_ready": False,
        "push_delivery_ready": False,
        "observed_at": body["deployment_snapshot"]["observed_at"],
    }
