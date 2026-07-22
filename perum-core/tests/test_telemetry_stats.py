"""R3: телеметрия и статистика. Pure-логика агрегации (без БД) + регистрация
эндпоинтов и их auth-гейты."""

import json
from datetime import datetime, timedelta
from pathlib import Path
from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.main import app
from app.services.stats import HEARTBEAT_FRESH_S, is_online, rollup, school_stat, support_delivery

client = TestClient(app)
DELIVERY_FIXTURE = json.loads((Path(__file__).parents[2] / "fixtures/contracts/support_escalation_delivery.v1.json").read_text())


def _metric(**kw):
    base = dict(
        last_heartbeat_at=None, users_total=0, students=0, teachers=0, parents=0,
        admins=0, grades_total=0, avg_grade=None, active_24h=0, balance_total=0,
        payload=None,
    )
    base.update(kw)
    return SimpleNamespace(**base)


def _school(id=1, slug="s", name="S", status="active", org_id=1):
    return SimpleNamespace(id=id, slug=slug, name=name, status=status, org_id=org_id)


def test_is_online_fresh_vs_stale():
    now = datetime(2026, 6, 12, 12, 0, 0)
    s = _school(1)
    assert is_online(s, _metric(last_heartbeat_at=now - timedelta(seconds=HEARTBEAT_FRESH_S - 1)), now) is True
    assert is_online(s, _metric(last_heartbeat_at=now - timedelta(seconds=HEARTBEAT_FRESH_S + 1)), now) is False
    assert is_online(s, None, now) is True  # active school, no metrics → online (контейнеры только поднялись)
    assert is_online(s, _metric(last_heartbeat_at=None), now) is True


def test_rollup_sums_and_counts_online():
    now = datetime(2026, 6, 12, 12, 0, 0)
    rows = [
        (_school(1), _metric(last_heartbeat_at=now, students=10, users_total=15)),
        (_school(2), _metric(last_heartbeat_at=now - timedelta(hours=1), students=5, users_total=8)),
        (_school(3), None),  # active, without metrics → online
    ]
    agg, schools = rollup(rows, now)
    assert agg["schools_total"] == 3
    assert agg["schools_online"] == 2  # свежий heartbeat + школа без метрик
    assert agg["students"] == 15
    assert agg["users_total"] == 23
    assert agg["support_escalation_delivery"]["schools_unknown"] == 3
    assert len(schools) == 3


def test_school_stat_shape():
    now = datetime(2026, 6, 12, 12, 0, 0)
    d = school_stat(_school(7, slug="g5"), _metric(students=3, last_heartbeat_at=now), now)
    assert d["id"] == 7 and d["slug"] == "g5" and d["online"] is True and d["students"] == 3
    # активная школа без снимка телеметрии — online (контейнеры только поднялись, телеметрии ещё нет)
    d0 = school_stat(_school(8), None, now)
    assert d0["online"] is True and d0["students"] == 0


def test_support_delivery_requires_fresh_strict_aggregate_and_rolls_up():
    now = datetime(2026, 6, 12, 12, 0, 0)
    accepted = {case["telemetry_status"]: case["metrics"] for case in DELIVERY_FIXTURE["accepted"]}
    payload = {"support_escalation_delivery": accepted["warning"]}
    result = support_delivery(_metric(last_heartbeat_at=now, payload=payload), now)
    assert result == {**payload["support_escalation_delivery"], "telemetry_status": "warning"}
    critical = {"support_escalation_delivery": accepted["critical"]}
    agg, schools = rollup([
        (_school(1), _metric(last_heartbeat_at=now, payload=payload)),
        (_school(2), _metric(last_heartbeat_at=now, payload=critical)),
        (_school(3), _metric(last_heartbeat_at=now - timedelta(hours=1), payload=payload)),
    ], now)
    assert schools[1]["support_escalation_delivery"]["telemetry_status"] == "critical"
    assert agg["support_escalation_delivery"] == {"pending": 2, "retrying": 2, "sla_breached": 1, "oldest_pending_age_seconds": 400, "schools_reporting": 2, "schools_unknown": 1}
    for invalid in DELIVERY_FIXTURE["rejected"]:
        assert support_delivery(_metric(last_heartbeat_at=now, payload={"support_escalation_delivery": invalid}), now) is None


def test_endpoints_registered():
    p = client.get("/openapi.json").json()["paths"]
    for path in [
        "/api/telemetry", "/api/platform/stats", "/api/organizations/{org_id}/stats",
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
