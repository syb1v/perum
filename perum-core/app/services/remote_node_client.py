"""HTTP-клиент для управления школами на удалённой ноде через агент."""

from __future__ import annotations

import logging
import ssl
from datetime import datetime, timezone

import httpx

from app.core.config import get_settings
from app.models import Node
from app.services.node_agent_auth import derive_node_agent_token

logger = logging.getLogger("perum.remote_node")


class RemoteNodeClient:
    """Клиент для отправки команд воркеру на удалённой ноде (ROLE=org_agent).

    Node Caddy exposes only /api/agent/* on the dedicated management TLS listener.
    The agent also requires the node-bound bearer token derived from AGENT_TOKEN."""

    def __init__(self, timeout: float = 120.0):
        self.timeout = timeout
        s = get_settings()
        self.port = s.AGENT_PORT
        self.legacy_port = s.AGENT_LEGACY_HTTP_PORT
        self.scheme = s.AGENT_SCHEME
        self.environment = s.ENVIRONMENT
        self.legacy_deadline = s.AGENT_LEGACY_HTTP_DEADLINE
        self.master_token = s.AGENT_TOKEN
        self.ssl_context = self._build_ssl_context(s)

    @staticmethod
    def _build_ssl_context(settings) -> ssl.SSLContext | bool:
        if settings.AGENT_SCHEME == "http":
            if settings.ENVIRONMENT == "prod":
                raise ValueError("production Core-to-Agent transport requires HTTPS")
            return True
        context = ssl.create_default_context(ssl.Purpose.SERVER_AUTH, cafile=settings.AGENT_CA_CERT or None)
        context.check_hostname = True
        context.verify_mode = ssl.CERT_REQUIRED
        if settings.AGENT_CLIENT_CERT and settings.AGENT_CLIENT_KEY:
            context.load_cert_chain(settings.AGENT_CLIENT_CERT, settings.AGENT_CLIENT_KEY)
        return context

    def _get_agent_url(self, node: Node, path: str) -> str:
        transport = getattr(node, "agent_transport", "legacy_http")
        if transport == "https_v1":
            scheme, port = "https", self.port
        elif transport == "legacy_http":
            if self.environment == "prod":
                if not self.legacy_deadline:
                    raise ValueError("legacy HTTP node transport requires AGENT_LEGACY_HTTP_DEADLINE")
                deadline = datetime.fromisoformat(self.legacy_deadline.replace("Z", "+00:00"))
                if deadline.tzinfo is None:
                    deadline = deadline.replace(tzinfo=timezone.utc)
                if datetime.now(timezone.utc) >= deadline:
                    raise ValueError("legacy HTTP node transport deadline has passed")
            scheme, port = "http", self.legacy_port
        else:
            raise ValueError(f"unsupported node agent transport capability: {transport}")
        return f"{scheme}://{node.hostname}:{port}/api/agent/{path.lstrip('/')}"

    async def _request(
        self,
        node: Node,
        method: str,
        path: str,
        json: dict | None = None,
    ) -> dict:
        url = self._get_agent_url(node, path)
        token = derive_node_agent_token(self.master_token, node.hostname)
        headers = {"Authorization": f"Bearer {token}"}
        verify = self.ssl_context if url.startswith("https://") else True
        async with httpx.AsyncClient(timeout=self.timeout, verify=verify) as client:
            resp = await client.request(method, url, json=json, headers=headers)
            if resp.status_code >= 300:
                raise RemoteNodeError(f"agent request failed with HTTP {resp.status_code}")
            return resp.json()

    async def provision_school(self, node: Node, school_data: dict) -> dict:
        return await self._request(node, "POST", "/schools/provision", json=school_data)

    async def update_school(self, node: Node, update_data: dict) -> dict:
        slug = update_data.get("school_slug")
        return await self._request(node, "POST", f"/schools/{slug}/update", json=update_data)

    async def apply_social_runtime(self, node: Node, school_slug: str, enabled: bool, generation: int) -> dict:
        return await self._request(node, "PUT", f"/schools/{school_slug}/social-runtime", json={"enabled": enabled, "generation": generation})

    async def suspend_school(self, node: Node, school_slug: str) -> dict:
        return await self._request(node, "POST", f"/schools/{school_slug}/suspend")

    async def unsuspend_school(self, node: Node, school_slug: str) -> dict:
        return await self._request(node, "POST", f"/schools/{school_slug}/unsuspend")

    async def deprovision_school(self, node: Node, school_slug: str, mode: str = "archive") -> dict:
        return await self._request(
            node, "POST", f"/schools/{school_slug}/deprovision", json={"school_slug": school_slug, "mode": mode}
        )

    async def provision_landing(self, node: Node, data: dict) -> dict:
        return await self._request(node, "POST", "/landing/provision", json=data)

    async def deprovision_landing(self, node: Node, org_slug: str) -> dict:
        return await self._request(node, "POST", f"/landing/{org_slug}/deprovision")

    async def internal_rpc(self, node: Node, school_slug: str, method: str, path: str, body: dict | None = None) -> dict:
        """Проксировать внутренний RPC стека школы на ноде (управление админами и т.п.).
        Возвращает {status_code, data}."""
        return await self._request(
            node, "POST", f"/schools/{school_slug}/internal-rpc",
            json={"method": method, "path": path, "body": body},
        )

    async def get_schools(self, node: Node) -> dict:
        return await self._request(node, "GET", "/schools")

    async def get_health(self, node: Node) -> dict:
        return await self._request(node, "GET", "/health")

    async def restart_node(self, node: Node) -> dict:
        """Перезагрузить docker-стек ноды (рестарт контейнеров школ), не сервер."""
        return await self._request(node, "POST", "/restart")

    async def rollout_web(self, node: Node, image: str) -> dict:
        return await self._request(node, "POST", "/web/rollout", json={"image": image})

    async def ping(self, node: Node) -> bool:
        try:
            await self._request(node, "GET", "/whoami")
            return True
        except Exception:
            return False


class RemoteNodeError(Exception):
    pass
