import asyncio
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from app.core.config import Settings
from app.models import School, SchoolSecret, UpdateHistory
from app.services.school_provisioner import ProvisioningError, _add_school_route, _bring_up, update_school
from app.services.stack_spec import build_school_stack_spec
from app.agent.schemas import AgentLandingRequest, AgentProvisionSchoolRequest


def test_failed_provision_keeps_preexisting_volumes():
    school = School(org_id=1, slug="alpha", name="Alpha")
    school.id = 1
    school.public_id = uuid4()
    secret = SchoolSecret(
        school_id=1,
        db_password="dbpw",
        secret_key="secret",
        telemetry_token="telemetry",
        redis_db_index=0,
    )
    settings = Settings()
    spec = build_school_stack_spec(school, secret, settings, image="tenant:release-a")
    assert spec.app_env["SCHOOL_PUBLIC_ID"] == str(school.public_id)
    assert spec.app_env["RELEASE_IMAGE"] == "tenant:release-a"
    docker = AsyncMock()
    docker.volume_exists.return_value = True
    docker.wait_for_healthy.side_effect = RuntimeError("app failed")
    caddy = AsyncMock()

    with pytest.raises(RuntimeError):
        asyncio.run(_bring_up(spec, "sch-alpha", settings, docker, caddy, None))

    docker.remove_containers.assert_awaited()
    docker.remove_volume.assert_not_awaited()
    docker.remove_stack.assert_not_awaited()


def test_node_school_route_uses_inspected_ips_for_host_network_caddy():
    async def run():
        docker = AsyncMock()
        docker.container_ip.side_effect = ["172.20.0.4", "172.18.0.8"]
        caddy = AsyncMock()

        await _add_school_route(
            Settings(ROLE="org_agent"), docker, caddy, "sch-alpha",
            "alpha.example.test", "school_alpha_app",
        )

        assert [call.args[0] for call in docker.container_ip.await_args_list] == [
            "school_alpha_app", "perum_web",
        ]
        caddy.add_route.assert_awaited_once_with(
            "sch-alpha", "alpha.example.test", "172.20.0.4:3000",
            web_upstream="172.18.0.8:3000",
        )

    asyncio.run(run())


def test_agent_identity_contract_carries_stable_organization_and_school_ids():
    org_id = uuid4()
    school_id = uuid4()
    request = AgentProvisionSchoolRequest(
        org_public_id=org_id,
        org_slug="acme",
        org_name="Acme",
        org_domain="acme.example",
        school_public_id=school_id,
        school_slug="school-1",
        school_name="School 1",
        release_tag="tenant:git-a",
        db_password="db",
        secret_key="secret",
        telemetry_token="telemetry",
    )
    landing = AgentLandingRequest(
        org_public_id=org_id,
        org_slug="acme",
        org_name="Acme",
        domain="acme.example",
    )

    assert request.org_public_id == org_id
    assert request.school_public_id == school_id
    assert landing.org_public_id == org_id


class UpdateDB:
    def __init__(self, secret):
        self.secret = secret
        self.history = None

    def add(self, value):
        if isinstance(value, UpdateHistory):
            self.history = value

    async def flush(self):
        pass

    async def get(self, model, key):
        return self.secret if model is SchoolSecret else None

    async def commit(self):
        pass

    async def refresh(self, value):
        pass


def _update_subject():
    school = School(org_id=1, slug="alpha", name="Alpha", status="active", release_tag="tenant:old")
    school.id = 1
    school.public_id = uuid4()
    secret = SchoolSecret(
        school_id=1,
        db_password="dbpw",
        secret_key="secret",
        telemetry_token="telemetry",
        internal_rpc_token="rpc",
        redis_db_index=0,
    )
    return school, UpdateDB(secret)


def test_failed_update_rolls_back_release_identity_status_and_history(monkeypatch):
    school, db = _update_subject()
    swap = AsyncMock(side_effect=[RuntimeError("new image unhealthy"), None])
    monkeypatch.setattr("app.services.school_provisioner.get_docker_client", lambda: AsyncMock())
    monkeypatch.setattr("app.services.school_provisioner._swap_app", swap)

    outcome = asyncio.run(update_school(
        school,
        db,
        Settings(),
        to_image="tenant:new",
        social_rollout_enabled=False,
        social_rollout_generation=0,
    ))

    assert [call.args[2] for call in swap.await_args_list] == ["tenant:new", "tenant:old"]
    assert outcome.rolled_back is True
    assert outcome.to_image == "tenant:old"
    assert school.release_tag == "tenant:old"
    assert school.status == "active"
    assert db.history.from_version == "tenant:old"
    assert db.history.to_version == "tenant:new"
    assert db.history.status == "rolled_back"
    assert db.history.error_message == "new image unhealthy"
    assert db.history.completed_at is not None


def test_failed_update_and_rollback_records_terminal_failure(monkeypatch):
    school, db = _update_subject()
    swap = AsyncMock(side_effect=[RuntimeError("new image unhealthy"), RuntimeError("old image unhealthy")])
    monkeypatch.setattr("app.services.school_provisioner.get_docker_client", lambda: AsyncMock())
    monkeypatch.setattr("app.services.school_provisioner._swap_app", swap)

    with pytest.raises(ProvisioningError, match="update and rollback failed"):
        asyncio.run(update_school(
            school,
            db,
            Settings(),
            to_image="tenant:new",
            social_rollout_enabled=False,
            social_rollout_generation=0,
        ))

    assert [call.args[2] for call in swap.await_args_list] == ["tenant:new", "tenant:old"]
    assert school.release_tag == "tenant:old"
    assert school.status == "failed"
    assert db.history.from_version == "tenant:old"
    assert db.history.to_version == "tenant:new"
    assert db.history.status == "failed"
    assert db.history.error_message == "update and rollback failed: new image unhealthy; rollback: old image unhealthy"
    assert db.history.completed_at is not None


def test_scanner_preflight_failure_leaves_old_app_untouched_without_rollback(monkeypatch):
    school, db = _update_subject()
    school.status = "updating"
    docker = AsyncMock()
    preflight = AsyncMock(side_effect=RuntimeError("relay configuration drift"))
    swap = AsyncMock()
    monkeypatch.setattr("app.services.school_provisioner.get_docker_client", lambda: docker)
    monkeypatch.setattr("app.services.school_provisioner.ensure_school_relay", preflight)
    monkeypatch.setattr("app.services.school_provisioner._swap_app", swap)

    with pytest.raises(ProvisioningError, match="scanner relay validation failed before app replacement"):
        asyncio.run(update_school(
            school,
            db,
            Settings(SCANNER_NODE_ENABLED=True),
            to_image="tenant:new",
            social_rollout_enabled=False,
            social_rollout_generation=0,
        ))

    preflight.assert_awaited_once()
    swap.assert_not_awaited()
    docker.remove_container.assert_not_awaited()
    assert school.status == "active"
    assert school.release_tag == "tenant:old"
    assert db.history.status == "failed"
    assert "relay configuration drift" in db.history.error_message
    assert "rollback" not in db.history.error_message
    assert db.history.completed_at is not None
