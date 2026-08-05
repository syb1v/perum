import asyncio
import subprocess
from types import SimpleNamespace

import pytest

from app.core.config import Settings
from app.models import Release
from app.services import node_bootstrap


class FakeSession:
    def __init__(self, release):
        self.release = release
        self.added = []

    def add(self, value):
        value.id = 1
        self.added.append(value)

    async def commit(self):
        pass

    async def refresh(self, value):
        pass

    async def scalar(self, statement):
        return self.release


@pytest.mark.parametrize(
    "image",
    [
        "ghcr.io/syb1v/perum-core:latest",
        "ghcr.io/syb1v/perum-core:git-123456789ab",
        "ghcr.io/syb1v/perum-core:git-123456789abz",
        "ghcr.io/syb1v/perum-core:git-123456789abc;touch /tmp/x",
        "",
    ],
)
def test_validate_app_image_rejects_mutable_or_unsafe_references(image):
    with pytest.raises(ValueError):
        node_bootstrap._validate_app_image("AGENT_IMAGE", image)


@pytest.mark.parametrize(
    "image",
    [
        "ghcr.io/syb1v/perum-core:git-123456789abc",
        "ghcr.io/syb1v/perum-core@sha256:" + "a" * 64,
    ],
)
def test_validate_app_image_accepts_immutable_references(image):
    assert node_bootstrap._validate_app_image("AGENT_IMAGE", image) == image


def test_generated_bootstrap_is_fail_closed_and_offline_capable(monkeypatch, tmp_path):
    settings = Settings(
        AGENT_IMAGE="ghcr.io/syb1v/perum-core:git-123456789abc",
        TENANT_IMAGE="ghcr.io/syb1v/perum-tenant:git-123456789abc",
        WEB_IMAGE="ghcr.io/syb1v/perum-web:git-fedcba654321",
        AGENT_TOKEN="agent-secret",
        IMAGE_REGISTRY="mirror.gcr.io",
    )
    release = Release(
        channel="stable",
        version_tag="git-123456789abc",
        image="ghcr.io/syb1v/perum-tenant:git-abcdef123456",
        is_current=True,
    )
    monkeypatch.setattr(node_bootstrap, "get_settings", lambda: settings)
    node = SimpleNamespace(name="node-one", hostname="node-one.example.com", enrollment_token_id=None)

    result = asyncio.run(node_bootstrap.generate_bootstrap_script(FakeSession(release), node))

    assert "watchtower" not in result.docker_compose.lower()
    assert "latest" not in result.docker_compose
    assert "image: ${WEB_IMAGE}" in result.docker_compose
    assert result.docker_compose.count("pull_policy: missing") == 6
    assert "flock -n 9" in result.script
    assert "docker compose config -q" in result.script
    assert "docker image inspect" in result.script
    assert "docker pull \"$image\"" in result.script
    assert "|| true" not in result.script
    assert "--pull-never" in result.script
    assert "mktemp \"$DIR/.env.tmp.XXXXXX\"" in result.script
    assert "env_value ENROLLMENT_TOKEN" in result.script
    assert "env_value AGENT_TOKEN" not in result.script
    assert "AGENT_TOKEN=agent-secret" not in result.script
    assert "WEB_IMAGE=ghcr.io/syb1v/perum-web:git-fedcba654321" in result.script

    script_path = tmp_path / "bootstrap.sh"
    script_path.write_text(result.script)
    subprocess.run(["bash", "-n", str(script_path)], check=True)


def test_generated_bootstrap_rejects_mutable_web_image_before_db_changes(monkeypatch):
    settings = Settings(
        AGENT_IMAGE="ghcr.io/syb1v/perum-core:git-123456789abc",
        TENANT_IMAGE="ghcr.io/syb1v/perum-tenant:git-123456789abc",
        WEB_IMAGE="ghcr.io/syb1v/perum-web:latest",
    )
    session = FakeSession(None)
    monkeypatch.setattr(node_bootstrap, "get_settings", lambda: settings)

    with pytest.raises(ValueError, match="WEB_IMAGE"):
        asyncio.run(
            node_bootstrap.generate_bootstrap_script(
                session, SimpleNamespace(name="node-one", hostname="node-one.example.com", enrollment_token_id=None)
            )
        )

    assert session.added == []
