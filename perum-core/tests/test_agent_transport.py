from types import SimpleNamespace

import pytest

from app.core.config import Settings
from app.services.remote_node_client import RemoteNodeClient


def _prod_settings(**overrides):
    values = {
        "ENVIRONMENT": "prod",
        "SECRET_KEY": "production-secret",
        "SECRETS_ENCRYPTION_KEY": "fernet-key",
        "AGENT_TOKEN": "agent-secret",
        "BOOTSTRAP_ADMIN_PASSWORD": "admin-secret",
        "AGENT_SCHEME": "https",
        "AGENT_CA_CERT": "/run/secrets/node-ca.crt",
    }
    values.update(overrides)
    return Settings(**values)


def test_production_rejects_http_agent_transport():
    with pytest.raises(ValueError, match="AGENT_SCHEME=https"):
        _prod_settings(AGENT_SCHEME="http")


@pytest.mark.parametrize(
    ("certificate", "key"),
    [("/client.crt", ""), ("", "/client.key")],
)
def test_mtls_certificate_and_key_are_paired(certificate, key):
    with pytest.raises(ValueError, match="configured together"):
        Settings(AGENT_CLIENT_CERT=certificate, AGENT_CLIENT_KEY=key)


def test_required_mtls_rejects_missing_client_identity():
    with pytest.raises(ValueError, match="AGENT_MTLS_REQUIRED"):
        Settings(AGENT_MTLS_REQUIRED=True)


def test_https_client_uses_private_ca_hostname_verification_and_client_identity(monkeypatch):
    calls = []

    class FakeContext:
        check_hostname = False
        verify_mode = None

        def load_cert_chain(self, certificate, key):
            calls.append((certificate, key))

    context = FakeContext()

    def create_default_context(purpose, cafile=None):
        calls.append((purpose, cafile))
        return context

    monkeypatch.setattr("app.services.remote_node_client.ssl.create_default_context", create_default_context)
    settings = _prod_settings(
        AGENT_CLIENT_CERT="/run/secrets/client.crt",
        AGENT_CLIENT_KEY="/run/secrets/client.key",
        AGENT_MTLS_REQUIRED=True,
    )
    monkeypatch.setattr("app.services.remote_node_client.get_settings", lambda: settings)

    client = RemoteNodeClient()

    assert client._get_agent_url(SimpleNamespace(hostname="10.20.30.40", agent_transport="https_v1"), "health") == (
        "https://10.20.30.40:3001/api/agent/health"
    )
    assert context.check_hostname is True
    assert context.verify_mode is not None
    assert calls[0][1] == "/run/secrets/node-ca.crt"
    assert calls[1] == ("/run/secrets/client.crt", "/run/secrets/client.key")


def test_development_http_remains_explicitly_supported(monkeypatch):
    monkeypatch.setattr("app.services.remote_node_client.get_settings", lambda: Settings(AGENT_SCHEME="http"))
    client = RemoteNodeClient()

    assert client._get_agent_url(SimpleNamespace(hostname="node.test"), "health").startswith("http://")
    assert client.ssl_context is True


def test_production_legacy_http_requires_explicit_future_deadline(monkeypatch):
    settings = _prod_settings(AGENT_LEGACY_HTTP_DEADLINE="2099-01-01T00:00:00Z")
    monkeypatch.setattr("app.services.remote_node_client.get_settings", lambda: settings)
    context = SimpleNamespace(check_hostname=False, verify_mode=None)
    monkeypatch.setattr("app.services.remote_node_client.ssl.create_default_context", lambda *args, **kwargs: context)

    client = RemoteNodeClient()

    assert client._get_agent_url(
        SimpleNamespace(hostname="legacy-node.test", agent_transport="legacy_http"), "health"
    ) == "http://legacy-node.test:3000/api/agent/health"


@pytest.mark.parametrize("deadline", ["", "2020-01-01T00:00:00Z"])
def test_production_legacy_http_fails_closed_without_active_transition_window(monkeypatch, deadline):
    settings = _prod_settings(AGENT_LEGACY_HTTP_DEADLINE=deadline)
    monkeypatch.setattr("app.services.remote_node_client.get_settings", lambda: settings)
    context = SimpleNamespace(check_hostname=False, verify_mode=None)
    monkeypatch.setattr("app.services.remote_node_client.ssl.create_default_context", lambda *args, **kwargs: context)
    client = RemoteNodeClient()

    with pytest.raises(ValueError, match="legacy HTTP"):
        client._get_agent_url(SimpleNamespace(hostname="legacy-node.test", agent_transport="legacy_http"), "health")
