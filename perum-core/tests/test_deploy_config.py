"""Проверка конфигурации deploy-файлов — порты, обязательные сервисы.
Гарантирует, что org_agent всегда публикует AGENT_PORT (3001) на хосте.
"""

from pathlib import Path
import yaml

ROOT = Path(__file__).parent.parent.parent
ORG_NODE_COMPOSE = ROOT / "deploy" / "org-node" / "docker-compose.yml"


def _load_compose():
    with open(ORG_NODE_COMPOSE) as f:
        return yaml.safe_load(f)


def test_org_node_compose_exists():
    assert ORG_NODE_COMPOSE.exists(), f"Не найден {ORG_NODE_COMPOSE}"


def test_org_agent_publishes_agent_port():
    compose = _load_compose()
    svc = compose["services"]["org_agent"]
    ports = svc.get("ports", [])
    # принимаем и строку "3001:3000", и объект {target:3000, published:3001}
    found = any(
        (isinstance(p, str) and p.startswith("3001:")) or
        (isinstance(p, dict) and str(p.get("published")) == "3001")
        for p in ports
    )
    assert found, (
        "org_agent не публикует AGENT_PORT 3001 на хосте. "
        "Добавь `ports: [\"3001:3000\"]` в deploy/org-node/docker-compose.yml"
    )


def test_caddy_publishes_http_https():
    compose = _load_compose()
    svc = compose["services"]["caddy"]
    ports = [str(p) for p in svc.get("ports", [])]
    assert any("80:80" in p for p in ports), "caddy должен публиковать 80:80"
    assert any("443:443" in p for p in ports), "caddy должен публиковать 443:443"
