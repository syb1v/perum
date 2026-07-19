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
        docker.container_exists.side_effect = [False, False, False]
        with patch("app.services.scanner_stack.psutil.virtual_memory") as memory:
            memory.return_value.total = 8 * 1024 ** 3
            await ensure_school_relay(spec, "sch-alpha", settings, docker)
        relay = [call.kwargs for call in docker.run_container.await_args_list if call.kwargs["role"] == "scanner-relay"][0]
        clamd = [call.kwargs for call in docker.run_container.await_args_list if call.kwargs["role"] == "clamd"][0]
        assert relay["network"] == "school_alpha_net" and "volumes" not in relay
        assert clamd["network"] == settings.SCANNER_BACKEND_NETWORK
        assert spec.app_env["SCANNER_HOST"] == "school_alpha_scanner_relay"
        docker.connect_to_network.assert_awaited_once_with("school_alpha_scanner_relay", settings.SCANNER_BACKEND_NETWORK, required=True)
        assert relay["security_opt"] == ["no-new-privileges"] and relay["pids_limit"] == 32
        assert relay["environment"]["MAX_BYTES"] == str(settings.SCANNER_RELAY_MAX_BYTES)
        assert docker.verify_container.await_count == 3
        relay_verify = docker.verify_container.await_args_list[-1].kwargs
        assert relay_verify["command"] == ["python", "-m", "app.scanner_relay"]
        assert relay_verify["environment"] == relay["environment"]
        updater_verify = docker.verify_container.await_args_list[0].kwargs
        assert updater_verify["networks"] == {settings.SCANNER_UPDATE_NETWORK}
        assert updater_verify["mounts"] == {"perum_node_clam_signatures": ("/var/lib/clamav", "rw")}
        clamd_verify = docker.verify_container.await_args_list[1].kwargs
        assert clamd_verify["health_test"] == ["CMD-SHELL", "clamdscan --ping 1 >/dev/null 2>&1"]
        assert clamd_verify["mounts"] == {"perum_node_clam_signatures": ("/var/lib/clamav", "ro")}
        assert clamd_verify["tmpfs"] == {"/tmp": "rw,noexec,nosuid,size=16m,mode=1777"}
    asyncio.run(run())


def test_existing_scanner_resources_are_inspected_and_drift_fails_closed():
    async def run():
        spec, settings = spec_and_settings()
        docker = AsyncMock()
        docker.container_exists.side_effect = [True, True, True]
        docker.verify_network.side_effect = DockerClientError("network drift")
        with patch("app.services.scanner_stack.psutil.virtual_memory") as memory:
            memory.return_value.total = 8 * 1024 ** 3
            with pytest.raises(DockerClientError, match="network drift"):
                await ensure_school_relay(spec, "sch-alpha", settings, docker)
        docker.run_container.assert_not_awaited()
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
