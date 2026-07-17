import asyncio
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from app.core.config import Settings
from app.models import School, SchoolSecret
from app.services.school_provisioner import _bring_up
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
