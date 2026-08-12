import asyncio
from types import SimpleNamespace

import httpx

from app.services.node_agent_auth import derive_node_agent_token
from app.services.remote_node_client import RemoteNodeClient


def test_node_agent_tokens_are_bound_to_hostname():
    first = derive_node_agent_token("master-secret", "node-one.example.com")
    second = derive_node_agent_token("master-secret", "node-two.example.com")

    assert first != second
    assert first == derive_node_agent_token("master-secret", "NODE-ONE.EXAMPLE.COM")
    assert "master-secret" not in first


def test_remote_client_sends_only_target_node_token(monkeypatch):
    async def run():
        sent_headers = []

        async def request(self, method, url, json=None, headers=None):
            sent_headers.append(headers)
            return httpx.Response(200, json={"ok": True})

        monkeypatch.setattr(httpx.AsyncClient, "request", request)
        client = RemoteNodeClient()
        client.master_token = "master-secret"
        node = SimpleNamespace(hostname="node-one.example.com")

        await client.get_health(node)

        assert sent_headers == [{
            "Authorization": f"Bearer {derive_node_agent_token('master-secret', node.hostname)}"
        }]

    asyncio.run(run())
