import asyncio
from datetime import datetime
from types import SimpleNamespace

import pytest

from app.agent.schemas import AgentSocialRuntimeConfigRequest
from app.agent.service import apply_social_runtime_on_node
from app.models import SchoolSocialRollout
from app.services.social_rollout import effective, state_dict
from app.services.stack_spec import build_school_stack_spec
from app.core.config import get_settings


@pytest.mark.parametrize(
    ("granted", "enabled", "expected"),
    [(False, False, False), (False, True, False), (True, False, False), (True, True, True)],
)
def test_effective_truth_table(granted, enabled, expected):
    state = SimpleNamespace(platform_granted=granted, org_enabled=enabled)
    assert effective(state) is expected


def test_status_requires_fresh_matching_observation():
    state = SimpleNamespace(
        school_id=1, platform_granted=True, org_enabled=True, generation=3,
        applied_generation=3, applied_enabled=True, apply_status="awaiting_heartbeat", apply_error=None,
    )
    old = SimpleNamespace(social_generation=2, social_ready=True, received_at=datetime.utcnow())
    assert state_dict(state, old)["status"] == "awaiting_heartbeat"
    fresh = SimpleNamespace(social_generation=3, social_ready=True, received_at=datetime.utcnow())
    assert state_dict(state, fresh)["status"] == "converged"


def test_school_stack_has_only_typed_social_runtime_values():
    school = SimpleNamespace(slug="sch1", name="School", public_id="school-public")
    secret = SimpleNamespace(db_password="db", secret_key="secret", telemetry_token="telemetry", internal_rpc_token=None, redis_db_index=0)
    spec = build_school_stack_spec(school, secret, get_settings(), image="tenant:test", social_rollout_enabled=True, social_rollout_generation=7)
    assert spec.app_env["SOCIAL_ROLLOUT_ENABLED"] == "true"
    assert spec.app_env["SOCIAL_ROLLOUT_GENERATION"] == "7"
    assert spec.app_env["TELEMETRY_INTERVAL_S"] == "10"


class _AgentDB:
    def __init__(self):
        self.school = SimpleNamespace(id=1, slug="sch1")
        self.state = SchoolSocialRollout(school_id=1, applied_generation=4, generation=4)

    async def scalar(self, statement):
        return self.school

    async def get(self, model, key):
        return self.state if model is SchoolSocialRollout else None


def test_agent_rejects_stale_generation_without_apply():
    response = asyncio.run(apply_social_runtime_on_node(_AgentDB(), "sch1", AgentSocialRuntimeConfigRequest(enabled=True, generation=3)))
    assert response.success is False
    assert response.applied_generation == 4
    assert response.message == "stale generation"
