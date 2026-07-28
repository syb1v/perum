import asyncio
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from app.agent.service import internal_rpc_on_node


class DB:
    async def scalar(self, statement):
        return SimpleNamespace(id=1, slug="alpha")

    async def get(self, model, key):
        return SimpleNamespace(telemetry_token="telemetry-secret", internal_rpc_token="rpc-secret")


def request(body=None):
    return SimpleNamespace(method="POST", path="/probe", body=body)


def test_internal_rpc_executes_inside_isolated_school_container_without_secret_args():
    async def run():
        docker = AsyncMock()
        docker.exec.return_value = (0, json.dumps({"status": 200, "body": json.dumps({"ok": True})}))
        with patch("app.agent.service.DockerClient", return_value=docker):
            response = await internal_rpc_on_node(DB(), "alpha", request({"value": 1}))

        assert response.status_code == 200 and response.data == {"ok": True}
        args = docker.exec.await_args.args
        assert args[0] == "school_alpha_app"
        assert "telemetry-secret" not in " ".join(args[1])
        assert "rpc-secret" not in " ".join(args[1])
        environment = docker.exec.await_args.kwargs["environment"]
        assert environment["RPC_BODY"] == '{"value": 1}'
        assert environment["RPC_TELEMETRY_TOKEN"] == "telemetry-secret"
        assert environment["RPC_INTERNAL_TOKEN"] == "rpc-secret"

    asyncio.run(run())


def test_internal_rpc_preserves_school_http_error_and_bounds_transport_failure():
    async def run():
        docker = AsyncMock()
        docker.exec.return_value = (0, json.dumps({"status": 409, "body": json.dumps({"detail": "conflict"})}))
        with patch("app.agent.service.DockerClient", return_value=docker):
            response = await internal_rpc_on_node(DB(), "alpha", request())
        assert response.status_code == 409 and response.data == {"detail": "conflict"}

        docker.exec.side_effect = RuntimeError("private docker error")
        with patch("app.agent.service.DockerClient", return_value=docker):
            response = await internal_rpc_on_node(DB(), "alpha", request())
        assert response.status_code == 502
        assert response.data["detail"].startswith("school unreachable on node:")

    asyncio.run(run())
