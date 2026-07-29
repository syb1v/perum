import yaml

from app.services.node_bootstrap import COMPOSE_TEMPLATE, _render_compose


def _load_compose():
    settings = type(
        "Settings",
        (),
        {
            "AGENT_IMAGE": "ghcr.io/syb1v/perum-core:git-123456789abc",
            "PUBLIC_CORE_URL": "https://admin.example.test",
            "PUBLIC_BASE_DOMAIN": "example.test",
            "IMAGE_REGISTRY": "mirror.gcr.io",
            "AGENT_PORT": 3001,
        },
    )()
    return yaml.safe_load(_render_compose(settings))


def test_org_agent_publishes_agent_port():
    compose = _load_compose()
    ports = compose["services"]["perum_agent"].get("ports", [])
    assert any(
        (isinstance(port, str) and port.startswith("3001:"))
        or (isinstance(port, dict) and str(port.get("published")) == "3001")
        for port in ports
    )


def test_caddy_publishes_http_https():
    compose = _load_compose()
    ports = [str(port) for port in compose["services"]["caddy"].get("ports", [])]
    assert any("80:80" in port for port in ports)
    assert any("443:443" in port for port in ports)


def test_node_template_has_no_mutable_updater():
    compose = _load_compose()
    assert "watchtower" not in compose["services"]
    assert all(":latest" not in service["image"] for service in compose["services"].values())
