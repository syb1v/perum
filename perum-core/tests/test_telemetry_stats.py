"""R3: телеметрия и статистика. Pure-логика агрегации (без БД) + регистрация
эндпоинтов и их auth-гейты."""

from datetime import datetime, timedelta
from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.main import app
from app.services.stats import HEARTBEAT_FRESH_S, is_online, rollup, school_stat

client = TestClient(app)


def _metric(**kw):
    base = dict(
        last_heartbeat_at=None, users_total=0, students=0, teachers=0, parents=0,
        admins=0, grades_total=0, avg_grade=None, active_24h=0, balance_total=0,
    )
    base.update(kw)
    return SimpleNamespace(**base)


def _school(id=1, slug="s", name="S", status="active", org_id=1):
    return SimpleNamespace(id=id, slug=slug, name=name, status=status, org_id=org_id)


def test_is_online_fresh_vs_stale():
    now = datetime(2026, 6, 12, 12, 0, 0)
    assert is_online(_metric(last_heartbeat_at=now - timedelta(seconds=HEARTBEAT_FRESH_S - 1)), now) is True
    assert is_online(_metric(last_heartbeat_at=now - timedelta(seconds=HEARTBEAT_FRESH_S + 1)), now) is False
    assert is_online(None, now) is False
    assert is_online(_metric(last_heartbeat_at=None), now) is False


def test_rollup_sums_and_counts_online():
    now = datetime(2026, 6, 12, 12, 0, 0)
    rows = [
        (_school(1), _metric(last_heartbeat_at=now, students=10, users_total=15)),
        (_school(2), _metric(last_heartbeat_at=now - timedelta(hours=1), students=5, users_total=8)),
        (_school(3), None),
    ]
    agg, schools = rollup(rows, now)
    assert agg["schools_total"] == 3
    assert agg["schools_online"] == 1  # только свежий heartbeat
    assert agg["students"] == 15
    assert agg["users_total"] == 23
    assert len(schools) == 3


def test_school_stat_shape():
    now = datetime(2026, 6, 12, 12, 0, 0)
    d = school_stat(_school(7, slug="g5"), _metric(students=3, last_heartbeat_at=now), now)
    assert d["id"] == 7 and d["slug"] == "g5" and d["online"] is True and d["students"] == 3
    # школа без снимка телеметрии — нули, offline
    d0 = school_stat(_school(8), None, now)
    assert d0["online"] is False and d0["students"] == 0


def test_endpoints_registered():
    p = client.get("/openapi.json").json()["paths"]
    for path in [
        "/api/telemetry", "/api/platform/stats", "/api/organizations/{slug}/stats",
        "/api/schools/stats/overview", "/api/schools/{school_id}/stats",
    ]:
        assert path in p, path


def test_telemetry_requires_token():
    # без X-Telemetry-Token → 401 ещё до обращения к БД
    assert client.post("/api/telemetry", json={"slug": "x", "metrics": {}}).status_code == 401


def test_platform_stats_requires_platform_admin():
    assert client.get("/api/platform/stats").status_code in (401, 403)


def test_org_stats_requires_org_admin():
    assert client.get("/api/schools/stats/overview").status_code in (401, 403)
    assert client.get("/api/schools/1/stats").status_code in (401, 403)
