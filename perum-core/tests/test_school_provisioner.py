import asyncio
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from app.core.config import Settings
from app.models import School, SchoolSecret, UpdateHistory
from app.services.school_provisioner import ProvisioningError, _bring_up, update_school
from app.services.stack_spec import build_school_stack_spec


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
