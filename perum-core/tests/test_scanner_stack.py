import asyncio
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest

from app.core.config import Settings
from app.core.docker_client import DockerClientError
from app.models import School, SchoolSecret
from app.services.scanner_stack import ensure_school_relay
from app.services.stack_spec import build_school_stack_spec


DIGEST = "@sha256:" + "a" * 64


def spec_and_settings():
    settings = Settings(SCANNER_NODE_ENABLED=True, SCANNER_CLAMD_IMAGE="clamd" + DIGEST, SCANNER_RELAY_IMAGE="relay" + DIGEST)
    school = School(id=1, org_id=1, slug="alpha", name="Alpha", public_id=uuid4())
    secret = SchoolSecret(school_id=1, db_password="db", secret_key="secret", telemetry_token="token", redis_db_index=0)
    return build_school_stack_spec(school, secret, settings), settings


def test_relay_is_only_dual_homed_school_component_without_volumes():
    async def run():
        spec, settings = spec_and_settings()
        docker = AsyncMock()
        docker.container_exists.return_value = False
        with patch("app.services.scanner_stack.psutil.virtual_memory") as memory:
            memory.return_value.total = 8 * 1024 ** 3
            await ensure_school_relay(spec, "sch-alpha", settings, docker)
        relay = [call.kwargs for call in docker.run_container.await_args_list if call.kwargs["role"] == "scanner-relay"][0]
        clamd = [call.kwargs for call in docker.run_container.await_args_list if call.kwargs["role"] == "clamd"][0]
        assert relay["network"] == "school_alpha_net" and "volumes" not in relay
        assert clamd["network"] == settings.SCANNER_BACKEND_NETWORK
        assert spec.app_env["SCANNER_HOST"] == "school_alpha_scanner_relay"
        docker.connect_to_network.assert_awaited_once_with("school_alpha_scanner_relay", settings.SCANNER_BACKEND_NETWORK, required=True)
    asyncio.run(run())


def test_scanner_rejects_unpinned_images_and_small_nodes():
    async def run():
        spec, settings = spec_and_settings()
        docker = AsyncMock()
        with patch("app.services.scanner_stack.psutil.virtual_memory") as memory:
            memory.return_value.total = 7 * 1024 ** 3
            with pytest.raises(DockerClientError):
                await ensure_school_relay(spec, "sch-alpha", settings, docker)
        settings.SCANNER_CLAMD_IMAGE = "clamd:latest"
        with patch("app.services.scanner_stack.psutil.virtual_memory") as memory:
            memory.return_value.total = 8 * 1024 ** 3
            with pytest.raises(DockerClientError):
                await ensure_school_relay(spec, "sch-alpha", settings, docker)
    asyncio.run(run())
