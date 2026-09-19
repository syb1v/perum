import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from pydantic import ValidationError

from app.agent.schemas import AgentWebRolloutRequest
from app.agent.router import capabilities, require_agent_token
from app.agent.service import (
    _recover_web_rollout_transaction,
    reconcile_desired_web_on_startup,
    rollout_web_on_node,
)
from app.core.docker_client import DockerClient, DockerClientError
from app.routers.releases_ci import CINodeTransportMarkRequest, ci_mark_node_transport
from app.services.remote_node_client import RemoteNodeClient
from app.services.web_rollout import rollout_web_to_active_organization_nodes


IMAGE = "ghcr.io/example/perum-web@sha256:" + "a" * 64


def rollout_settings(**overrides):
    values = {"WEB_IMAGE": IMAGE, "AGENT_TOKEN": "agent-secret"}
    values.update(overrides)
    return SimpleNamespace(**values)


class AgentDB:
    def __init__(self, desired_web_image=None, **rollout):
        values = {
            "desired_web_image": desired_web_image,
            "web_rollout_target_image": None,
            "web_rollout_previous_image_id": None,
            "web_rollout_previous_image_ref": None,
            "web_rollout_phase": None,
            "web_rollout_started_at": None,
            "web_rollout_updated_at": None,
            "web_rollout_error_code": None,
        }
        values.update(rollout)
        self.state = SimpleNamespace(**values)
        self.commit = AsyncMock()
        self.rollback = AsyncMock()

    async def scalar(self, statement):
        return self.state


@pytest.mark.parametrize(
    "image",
    [
        "ghcr.io/example/perum-web:latest",
        "ghcr.io/example/perum-web@sha256:" + "A" * 64,
        "docker.io/example/perum-web@sha256:" + "a" * 64,
        "ghcr.io/example/perum-core@sha256:" + "a" * 64,
    ],
)
def test_web_rollout_accepts_only_exact_immutable_ghcr_perum_web_ref(image):
    with pytest.raises(ValidationError):
        AgentWebRolloutRequest(image=image)


def test_remote_client_posts_web_rollout_to_authenticated_agent(monkeypatch):
    async def run():
        client = RemoteNodeClient()
        client._request = AsyncMock(return_value={"success": True})
        node = SimpleNamespace(hostname="node.example.com")

        result = await client.rollout_web(node, IMAGE)

        assert result == {"success": True}
        client._request.assert_awaited_once_with(
            node, "POST", "/web/rollout", json={"image": IMAGE}
        )

    asyncio.run(run())


def test_agent_mutations_fail_closed_when_token_is_empty():
    async def run():
        with patch("app.agent.router.get_settings", return_value=rollout_settings(AGENT_TOKEN="")):
            with pytest.raises(Exception) as exc:
                await require_agent_token(None)
        assert exc.value.status_code == 503

    asyncio.run(run())


def test_agent_capability_proof_is_authenticated_and_binds_exact_image():
    async def run():
        settings = rollout_settings(ROLE="org_agent", AGENT_IMAGE="ghcr.io/example/perum-core@sha256:" + "c" * 64)
        with patch("app.agent.router.get_settings", return_value=settings):
            await require_agent_token("Bearer agent-secret")
            proof = await capabilities()
        assert proof == {
            "agent_image": settings.AGENT_IMAGE,
            "capabilities": ["web_rollout_v1"],
        }

    asyncio.run(run())


def test_core_transport_mark_is_atomic_when_candidate_proof_fails():
    async def run():
        image = "ghcr.io/example/perum-core@sha256:" + "c" * 64
        node = SimpleNamespace(
            id=9,
            agent_transport="legacy_http",
            agent_transport_version=None,
            web_rollout_version=None,
        )
        db = AsyncMock()
        db.add = MagicMock()
        db.get.return_value = None
        db.scalar.return_value = node
        client = AsyncMock()
        client._request.side_effect = [
            {"role": "org_agent"},
            {"status": "ok"},
            {"agent_image": "ghcr.io/example/perum-core@sha256:" + "d" * 64, "capabilities": ["web_rollout_v1"]},
        ]
        with patch("app.routers.releases_ci.RemoteNodeClient", return_value=client):
            result = await ci_mark_node_transport(
                CINodeTransportMarkRequest(
                    transition_id="11111111-1111-1111-1111-111111111111",
                    node_id=9,
                    agent_image=image,
                    transport="https_v1",
                    expected_transport="legacy_http",
                ), db
            )
        assert result["phase"] == "rejected"
        assert result["error_code"] == "candidate_image_mismatch"
        assert node.agent_transport == "legacy_http"
        assert node.agent_transport_version is None
        assert node.web_rollout_version is None
        db.commit.assert_awaited_once_with()

    asyncio.run(run())


def test_core_transport_mark_commits_transport_and_rollout_capability_together():
    async def run():
        image = "ghcr.io/example/perum-core@sha256:" + "c" * 64
        node = SimpleNamespace(
            id=9,
            agent_transport="legacy_http",
            agent_transport_version=None,
            web_rollout_version=None,
        )
        db = AsyncMock()
        db.add = MagicMock()
        db.get.return_value = None
        db.scalar.return_value = node
        client = AsyncMock()
        client._request.side_effect = [
            {"role": "org_agent"},
            {"status": "ok"},
            {"agent_image": image, "capabilities": ["web_rollout_v1"]},
        ]
        with patch("app.routers.releases_ci.RemoteNodeClient", return_value=client):
            result = await ci_mark_node_transport(
                CINodeTransportMarkRequest(
                    transition_id="22222222-2222-2222-2222-222222222222",
                    node_id=9,
                    agent_image=image,
                    transport="https_v1",
                    expected_transport="legacy_http",
                ), db
            )
        assert result == {
            "transition_id": "22222222-2222-2222-2222-222222222222",
            "node_id": 9,
            "phase": "committed",
            "committed": True,
            "error_code": None,
            "error_reason": None,
            "agent_transport": "https_v1",
            "agent_transport_version": image,
            "web_rollout_version": "web_rollout_v1",
        }
        assert db.commit.await_count == 1

    asyncio.run(run())


def test_core_transport_mark_persists_terminal_expected_state_rejection():
    async def run():
        image = "ghcr.io/example/perum-core@sha256:" + "c" * 64
        node = SimpleNamespace(
            id=9,
            agent_transport="https_v1",
            agent_transport_version="other",
            web_rollout_version="web_rollout_v1",
        )
        db = AsyncMock()
        db.add = MagicMock()
        db.get.return_value = None
        db.scalar.return_value = node

        result = await ci_mark_node_transport(
            CINodeTransportMarkRequest(
                transition_id="33333333-3333-4333-8333-333333333333",
                node_id=9,
                agent_image=image,
                transport="https_v1",
                expected_transport="legacy_http",
            ),
            db,
        )

        assert result["phase"] == "rejected"
        assert result["error_code"] == "expected_state_mismatch"
        db.commit.assert_awaited_once_with()

    asyncio.run(run())


@pytest.mark.parametrize("phase", ["committed", "rejected"])
def test_core_transport_mark_terminal_retry_is_idempotent(phase):
    async def run():
        image = "ghcr.io/example/perum-core@sha256:" + "c" * 64
        node = SimpleNamespace(id=9)
        receipt = SimpleNamespace(
            transition_id="44444444-4444-4444-8444-444444444444",
            node_id=9,
            agent_image=image,
            expected_transport="legacy_http",
            expected_transport_version=None,
            expected_web_rollout_version=None,
            phase=phase,
            error_code="candidate_unavailable" if phase == "rejected" else None,
            error_reason="Candidate HTTPS proof was unavailable" if phase == "rejected" else None,
            resulting_transport="https_v1" if phase == "committed" else None,
            resulting_transport_version=image if phase == "committed" else None,
            resulting_web_rollout_version="web_rollout_v1" if phase == "committed" else None,
        )
        db = AsyncMock()
        db.scalar.return_value = node
        db.get.return_value = receipt

        with patch("app.routers.releases_ci.RemoteNodeClient") as client:
            result = await ci_mark_node_transport(
                CINodeTransportMarkRequest(
                    transition_id=receipt.transition_id,
                    node_id=9,
                    agent_image=image,
                    transport="https_v1",
                    expected_transport="legacy_http",
                ),
                db,
            )

        assert result["phase"] == phase
        client.assert_not_called()
        db.commit.assert_not_awaited()

    asyncio.run(run())


def test_agent_accepts_a_new_digest_from_the_configured_repository():
    async def run():
        other = "ghcr.io/example/perum-web@sha256:" + "b" * 64
        docker = AsyncMock()
        docker.inspect_web_container.side_effect = [
            ("sha256:old", "old-ref", frozenset()),
            ("sha256:new", other, frozenset()),
        ]
        docker.web_container_has_digest.side_effect = [False, True]
        docker.replace_web_container.return_value = ("sha256:new", frozenset())
        docker.container_image_id.return_value = "sha256:new"
        docker.container_identities.return_value = frozenset()
        with patch("app.agent.service.get_settings", return_value=rollout_settings()):
            with patch("app.agent.service.DockerClient", return_value=docker), patch(
                "app.agent.service._resync_node_caddy_routes", new=AsyncMock()
            ):
                receipt = await rollout_web_on_node(AgentDB(), AgentWebRolloutRequest(image=other))
        assert receipt.success is True

    asyncio.run(run())


def test_agent_rejects_digest_from_a_different_repository():
    async def run():
        wrong_repo = "ghcr.io/attacker/perum-web@sha256:" + "b" * 64
        db = AgentDB()
        with patch("app.agent.service.get_settings", return_value=rollout_settings()):
            receipt = await rollout_web_on_node(db, AgentWebRolloutRequest(image=wrong_repo))
        assert receipt.success is False
        assert receipt.message == "Web image is not trusted"
        db.commit.assert_not_awaited()

    asyncio.run(run())


def test_agent_web_rollout_requires_health_identity_protection_and_routes():
    async def run():
        docker = AsyncMock()
        protected = frozenset({("caddy", "caddy-id"), ("school_alpha_app", "app-id")})
        docker.inspect_web_container.side_effect = [
            ("sha256:old", "old-ref", protected),
            ("sha256:new", IMAGE, protected),
        ]
        docker.web_container_has_digest.side_effect = [False, True]
        docker.replace_web_container.return_value = ("sha256:new", protected)
        docker.container_image_id.return_value = "sha256:new"
        docker.container_identities.return_value = protected
        docker.container_identities.return_value = protected

        with patch("app.agent.service.get_settings", return_value=rollout_settings()), patch(
            "app.agent.service.DockerClient", return_value=docker
        ), patch(
            "app.agent.service._resync_node_caddy_routes", new=AsyncMock()
        ) as resync:
            db = AgentDB()
            receipt = await rollout_web_on_node(db, AgentWebRolloutRequest(image=IMAGE))

        assert receipt.success is True
        assert receipt.protected_containers_unchanged is True
        assert receipt.routes_resynced is True
        docker.wait_for_healthy.assert_awaited_once_with(
            "perum_web", timeout_s=180, require_healthcheck=True
        )
        resync.assert_awaited_once_with(strict=True)
        docker.rollback_web_container.assert_not_awaited()
        docker.finalize_web_container.assert_awaited_once_with()
        assert db.state.desired_web_image == IMAGE
        assert db.commit.await_count == 5

    asyncio.run(run())


def test_agent_web_rollout_rolls_back_when_strict_route_resync_fails():
    async def run():
        docker = AsyncMock()
        protected = frozenset({("caddy", "caddy-id")})
        docker.inspect_web_container.side_effect = [
            ("sha256:old", "old-ref", protected),
            ("sha256:new", IMAGE, protected),
            ("sha256:old", "old-ref", protected),
        ]
        docker.web_container_has_digest.side_effect = [False, True]
        docker.replace_web_container.return_value = ("sha256:new", protected)
        docker.container_identities.return_value = protected
        docker.container_image_id.side_effect = ["sha256:new", "sha256:old"]
        resync = AsyncMock(side_effect=[RuntimeError("route failed"), None])

        with patch("app.agent.service.get_settings", return_value=rollout_settings()), patch(
            "app.agent.service.DockerClient", return_value=docker
        ), patch(
            "app.agent.service._resync_node_caddy_routes", new=resync
        ):
            db = AgentDB()
            receipt = await rollout_web_on_node(db, AgentWebRolloutRequest(image=IMAGE))

        assert receipt.success is False
        assert receipt.rolled_back is True
        assert receipt.protected_containers_unchanged is True
        docker.recover_previous_web_container.assert_awaited_once_with("sha256:old")
        assert resync.await_count == 2
        assert db.state.desired_web_image is None
        assert db.state.web_rollout_phase is None

    asyncio.run(run())


def test_core_aggregates_all_node_receipts_without_short_circuiting():
    class Scalars:
        def all(self):
            return [
                SimpleNamespace(id=1, hostname="one.example.com", web_rollout_version="web_rollout_v1"),
                SimpleNamespace(id=2, hostname="two.example.com", web_rollout_version="web_rollout_v1"),
            ]

    class Result:
        def scalars(self):
            return Scalars()

    class DB:
        async def scalar(self, statement):
            return 1

        async def execute(self, statement):
            return Result()

    async def run():
        client = AsyncMock()
        client.rollout_web.side_effect = [
            {"success": True, "image": IMAGE},
            RuntimeError("agent unavailable"),
        ]
        with patch("app.services.web_rollout.RemoteNodeClient", return_value=client):
            result = await rollout_web_to_active_organization_nodes(IMAGE, DB())

        assert result["success"] is False
        assert result["nodes_total"] == 2
        assert result["nodes_succeeded"] == 1
        assert result["nodes_failed"] == 1
        assert [receipt["node_id"] for receipt in result["receipts"]] == [1, 2]
        assert client.rollout_web.await_count == 2

    asyncio.run(run())


def test_core_fails_suspicious_zero_target_rollout_when_active_orgs_exist():
    class Result:
        def scalars(self):
            return SimpleNamespace(all=lambda: [])

    class DB:
        async def scalar(self, statement):
            return 1

        async def execute(self, statement):
            return Result()

    result = asyncio.run(rollout_web_to_active_organization_nodes(IMAGE, DB()))
    assert result["success"] is False
    assert result["nodes_total"] == 0
    assert result["nodes_failed"] == 1


def test_core_reports_legacy_workload_node_pending_before_deadline():
    class DB:
        async def scalar(self, statement):
            return 1

        async def execute(self, statement):
            nodes = [SimpleNamespace(id=4, hostname="legacy.example", web_rollout_version=None)]
            return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: nodes))

    settings = SimpleNamespace(WEB_ROLLOUT_LEGACY_DEADLINE="2999-01-01T00:00:00Z")
    with patch("app.services.web_rollout.get_settings", return_value=settings), patch(
        "app.services.web_rollout.RemoteNodeClient"
    ) as client:
        result = asyncio.run(rollout_web_to_active_organization_nodes(IMAGE, DB()))
    assert result["success"] is True
    assert result["nodes_pending"] == 1
    assert result["nodes_failed"] == 0
    assert result["receipts"] == [{
        "node_id": 4,
        "success": True,
        "image": IMAGE,
        "pending": True,
        "message": "node is pending Agent Web rollout capability transition",
    }]
    client.return_value.rollout_web.assert_not_called()


@pytest.mark.parametrize("deadline", ["", "2000-01-01T00:00:00Z"])
def test_core_fails_closed_for_legacy_workload_node_without_active_window(deadline):
    class DB:
        async def scalar(self, statement):
            return 1

        async def execute(self, statement):
            nodes = [SimpleNamespace(id=4, hostname="legacy.example", web_rollout_version=None)]
            return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: nodes))

    with patch(
        "app.services.web_rollout.get_settings",
        return_value=SimpleNamespace(WEB_ROLLOUT_LEGACY_DEADLINE=deadline),
    ):
        result = asyncio.run(rollout_web_to_active_organization_nodes(IMAGE, DB()))
    assert result["success"] is False
    assert result["nodes_pending"] == 0
    assert result["nodes_failed"] == 1


def test_agent_sanitizes_rollout_and_rollback_failures():
    async def run():
        docker = AsyncMock()
        protected = frozenset({("caddy", "id")})
        docker.inspect_web_container.side_effect = [
            ("sha256:old", "old-ref", protected),
            ("sha256:new", IMAGE, protected),
        ]
        docker.web_container_has_digest.side_effect = [False, True]
        docker.replace_web_container.return_value = ("sha256:new", protected)
        docker.wait_for_healthy.side_effect = [RuntimeError("secret new failure"), RuntimeError("secret old failure")]
        with patch("app.agent.service.get_settings", return_value=rollout_settings()), patch(
            "app.agent.service.DockerClient", return_value=docker
        ):
            return await rollout_web_on_node(AgentDB(), AgentWebRolloutRequest(image=IMAGE))

    receipt = asyncio.run(run())
    assert receipt.success is False
    assert receipt.message == "Web rollout and rollback failed"
    assert "secret" not in receipt.message


def test_agent_rollout_is_idempotent_when_desired_digest_is_running():
    async def run():
        db = AgentDB(desired_web_image=IMAGE)
        docker = AsyncMock()
        docker.inspect_web_container.return_value = ("sha256:current", IMAGE, frozenset({("caddy", "id")}))
        docker.web_container_has_digest.return_value = True
        docker.container_image_id.return_value = "sha256:current"
        docker.container_identities.return_value = frozenset({("caddy", "id")})
        with patch("app.agent.service.get_settings", return_value=rollout_settings()), patch(
            "app.agent.service.DockerClient", return_value=docker
        ), patch("app.agent.service._resync_node_caddy_routes", new=AsyncMock()):
            receipt = await rollout_web_on_node(db, AgentWebRolloutRequest(image=IMAGE))
        assert receipt.success is True
        docker.replace_web_container.assert_not_awaited()
        docker.finalize_web_container.assert_not_awaited()
        db.commit.assert_awaited_once_with()

    asyncio.run(run())


def test_startup_reconciles_persisted_desired_image_when_runtime_is_stale():
    class Session:
        async def __aenter__(self):
            return AgentDB(desired_web_image=IMAGE)

        async def __aexit__(self, exc_type, exc, tb):
            return False

    async def run():
        docker = AsyncMock()
        docker.web_container_has_digest.return_value = False
        receipt = SimpleNamespace(success=True, message=None)
        rollout = AsyncMock(return_value=receipt)
        with patch("app.agent.service.SessionLocal", return_value=Session()), patch(
            "app.agent.service.DockerClient", return_value=docker
        ), patch("app.agent.service.rollout_web_on_node", new=rollout):
            await reconcile_desired_web_on_startup()
        assert rollout.await_count == 1
        assert rollout.await_args.args[1].image == IMAGE

    asyncio.run(run())


@pytest.mark.parametrize("phase", ["swapped", "validated", "finalizing"])
def test_startup_recovery_finalizes_healthy_target_after_crash(phase):
    async def run():
        db = AgentDB(
            web_rollout_target_image=IMAGE,
            web_rollout_previous_image_id="sha256:old",
            web_rollout_previous_image_ref="old-ref",
            web_rollout_phase=phase,
        )
        docker = AsyncMock()
        docker.web_container_has_digest.return_value = True
        docker.inspect_web_container.return_value = ("sha256:new", IMAGE, frozenset())
        docker.container_image_id.return_value = "sha256:new"
        with patch("app.agent.service._resync_node_caddy_routes", new=AsyncMock()):
            recovered = await _recover_web_rollout_transaction(db, db.state, docker)
        assert recovered is True
        assert db.state.desired_web_image == IMAGE
        assert db.state.web_rollout_phase is None
        docker.finalize_web_container.assert_awaited_once_with()
        docker.recover_previous_web_container.assert_not_awaited()

    asyncio.run(run())


def test_startup_recovery_restores_previous_runtime_after_prepared_crash():
    async def run():
        db = AgentDB(
            web_rollout_target_image=IMAGE,
            web_rollout_previous_image_id="sha256:old",
            web_rollout_previous_image_ref="old-ref",
            web_rollout_phase="prepared",
        )
        docker = AsyncMock()
        docker.inspect_web_container.return_value = ("sha256:old", "old-ref", frozenset())
        with patch("app.agent.service._resync_node_caddy_routes", new=AsyncMock()):
            recovered = await _recover_web_rollout_transaction(db, db.state, docker)
        assert recovered is True
        assert db.state.web_rollout_phase is None
        docker.recover_previous_web_container.assert_awaited_once_with("sha256:old")

    asyncio.run(run())


def test_failed_finalize_returns_failure_and_leaves_recoverable_transaction():
    async def run():
        protected = frozenset({("caddy", "id")})
        db = AgentDB()
        docker = AsyncMock()
        docker.inspect_web_container.side_effect = [
            ("sha256:old", "old-ref", protected),
            ("sha256:new", IMAGE, protected),
            ("sha256:new", IMAGE, protected),
        ]
        docker.web_container_has_digest.side_effect = [False, True, True]
        docker.replace_web_container.return_value = ("sha256:new", protected)
        docker.container_image_id.return_value = "sha256:new"
        docker.container_identities.return_value = protected
        docker.finalize_web_container.side_effect = RuntimeError("cleanup failed")
        docker.recover_previous_web_container.side_effect = RuntimeError("restore failed")
        with patch("app.agent.service.get_settings", return_value=rollout_settings()), patch(
            "app.agent.service.DockerClient", return_value=docker
        ), patch("app.agent.service._resync_node_caddy_routes", new=AsyncMock()):
            receipt = await rollout_web_on_node(db, AgentWebRolloutRequest(image=IMAGE))
        assert receipt.success is False
        assert receipt.message == "Web rollout and rollback failed"
        assert db.state.web_rollout_target_image == IMAGE
        assert db.state.web_rollout_phase == "finalizing"
        assert db.state.web_rollout_error_code == "rollback_recovery_failed"

    asyncio.run(run())


def test_web_runtime_projection_rejects_drift_before_mutation():
    image_config = {
        "Env": ["PATH=/usr/bin"],
        "Cmd": ["node", "server.js"],
        "Entrypoint": ["docker-entrypoint.sh"],
        "Healthcheck": {"Test": ["CMD", "healthcheck"]},
        "User": "nextjs",
        "WorkingDir": "/app",
    }
    container = SimpleNamespace(
        attrs={
            "Image": "sha256:old",
            "Config": image_config | {"Image": "old-ref", "Env": ["PATH=/usr/bin", "NODE_ENV=development"]},
            "HostConfig": {
                "NetworkMode": "perum_internal",
                "RestartPolicy": {"Name": "unless-stopped"},
            },
            "NetworkSettings": {"Networks": {"perum_internal": {}}},
            "Mounts": [],
        },
        image=SimpleNamespace(attrs={"Config": image_config}, reload=lambda: None),
        reload=lambda: None,
    )
    client = DockerClient()
    client._client = SimpleNamespace(
        containers=SimpleNamespace(
            get=lambda name: container,
            list=lambda all: [container],
        )
    )
    with pytest.raises(DockerClientError, match="runtime configuration drift"):
        asyncio.run(client.inspect_web_container())


def test_core_sanitizes_agent_receipt_and_rejects_wrong_image():
    class Result:
        def scalars(self):
            return SimpleNamespace(all=lambda: [SimpleNamespace(
                id=7, hostname="node.example", web_rollout_version="web_rollout_v1"
            )])

    class DB:
        async def scalar(self, statement):
            return 1

        async def execute(self, statement):
            return Result()

    async def run():
        client = AsyncMock()
        client.rollout_web.return_value = {
            "success": True,
            "image": "ghcr.io/attacker/perum-web@sha256:" + "b" * 64,
            "message": "token=secret",
            "unexpected": "secret",
        }
        with patch("app.services.web_rollout.RemoteNodeClient", return_value=client):
            return await rollout_web_to_active_organization_nodes(IMAGE, DB())

    result = asyncio.run(run())
    assert result["success"] is False
    assert result["receipts"] == [
        {"node_id": 7, "success": False, "message": "agent returned an invalid rollout receipt"}
    ]
