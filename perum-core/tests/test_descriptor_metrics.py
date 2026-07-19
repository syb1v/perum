import asyncio

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


def test_descriptor_counters_render_only_bounded_reason_labels(monkeypatch):
    reset_descriptor_counters()
    observe_descriptor_reason("missing_release")
    observe_descriptor_reason("stale_snapshot")
    monkeypatch.setattr(metrics.get_settings(), "METRICS_TOKEN", "secret")
    output = asyncio.run(metrics.metrics(_DB(), authorization="Bearer secret", x_metrics_token=None))
    assert 'perum_mobile_descriptor_release_total{reason="missing_release"} 1' in output
    assert 'perum_mobile_descriptor_deployment_total{reason="stale_snapshot"} 1' in output
    assert "school=" not in "\n".join(line for line in output.splitlines() if "descriptor_" in line)
    assert "release=" not in "\n".join(line for line in output.splitlines() if "descriptor_" in line)
    reset_descriptor_counters()
