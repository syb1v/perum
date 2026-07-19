import asyncio
from datetime import datetime
from types import SimpleNamespace

from app.routers import metrics
from app.services.descriptor_observability import observe_descriptor_reason, reset_descriptor_counters


class _Result:
    def all(self):
        return []

    def scalar_one_or_none(self):
        return None


class _DB:
    async def execute(self, statement):
        return _Result()

    async def scalar(self, statement):
        return 0


class _PopulatedDB(_DB):
    def __init__(self):
        self.calls = 0

    async def execute(self, statement):
        self.calls += 1
        if self.calls == 4:
            school = SimpleNamespace(id=1, slug="school-secret", name="School", status="active")
            metric = SimpleNamespace(last_heartbeat_at=datetime.utcnow(), students=10, users_total=12, avg_grade=None, payload={"support_escalation_delivery": {"pending": 1, "retrying": 2, "sla_breached": 1, "oldest_pending_age_seconds": 400}}, admins=0, teachers=0, parents=0, grades_total=0, active_24h=0, balance_total=0)
            return SimpleNamespace(all=lambda: [(school, "org-secret", metric)])
        return _Result()


def test_descriptor_counters_render_only_bounded_reason_labels(monkeypatch):
    reset_descriptor_counters()


def test_support_delivery_metrics_are_unlabelled_and_populated_school_path_works(monkeypatch):
    monkeypatch.setattr(metrics.get_settings(), "METRICS_TOKEN", "secret")
    output = asyncio.run(metrics.metrics(_PopulatedDB(), authorization="Bearer secret", x_metrics_token=None))
    support_lines = [line for line in output.splitlines() if line.startswith("perum_support_")]
    assert "perum_support_escalation_delivery_pending 1" in support_lines
    assert "perum_support_escalation_delivery_retrying 2" in support_lines
    assert "perum_support_escalation_delivery_sla_breached 1" in support_lines
    assert "perum_support_escalation_delivery_unknown_schools 0" in support_lines
    assert all("{" not in line and "school-secret" not in line and "org-secret" not in line for line in support_lines)
    observe_descriptor_reason("missing_release")
    observe_descriptor_reason("stale_snapshot")
    monkeypatch.setattr(metrics.get_settings(), "METRICS_TOKEN", "secret")
    output = asyncio.run(metrics.metrics(_DB(), authorization="Bearer secret", x_metrics_token=None))
    assert 'perum_mobile_descriptor_release_total{reason="missing_release"} 1' in output
    assert 'perum_mobile_descriptor_deployment_total{reason="stale_snapshot"} 1' in output
    assert "school=" not in "\n".join(line for line in output.splitlines() if "descriptor_" in line)
    assert "release=" not in "\n".join(line for line in output.splitlines() if "descriptor_" in line)
    reset_descriptor_counters()
