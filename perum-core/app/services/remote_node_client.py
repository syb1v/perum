"""HTTP-клиент для управления школами на удалённой ноде через агент."""

from __future__ import annotations

import logging

import httpx

from app.core.config import get_settings
from app.models import Node

logger = logging.getLogger("perum.remote_node")


class RemoteNodeClient:
    """Клиент для отправки команд воркеру на удалённой ноде (ROLE=org_agent).

    Воркер слушает API на порту AGENT_PORT (публикуется compose'ом ноды), роуты
    смонтированы под /api/agent. Аутентификация — общим секретом AGENT_TOKEN."""

    def __init__(self, timeout: float = 120.0):
        self.timeout = timeout
        s = get_settings()
        self.port = s.AGENT_PORT
        self.token = s.AGENT_TOKEN

    def _get_agent_url(self, node: Node, path: str) -> str:
        return f"http://{node.hostname}:{self.port}/api/agent/{path.lstrip('/')}"

    async def _request(
        self,
        node: Node,
        method: str,
        path: str,
        json: dict | None = None,
    ) -> dict:
        url = self._get_agent_url(node, path)
        headers = {"Authorization": f"Bearer {self.token}"} if self.token else {}
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.request(method, url, json=json, headers=headers)
            if resp.status_code >= 300:
                raise RemoteNodeError(
                    f"Node {node.hostname} returned {resp.status_code}: {resp.text[:200]}"
                )
            return resp.json()

    async def provision_school(self, node: Node, school_data: dict) -> dict:
        return await self._request(node, "POST", "/schools/provision", json=school_data)

    async def update_school(self, node: Node, update_data: dict) -> dict:
        slug = update_data.get("school_slug")
        return await self._request(node, "POST", f"/schools/{slug}/update", json=update_data)

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

    async def ping(self, node: Node) -> bool:
        try:
            await self._request(node, "GET", "/whoami")
            return True
        except Exception:
            return False


class RemoteNodeError(Exception):
    pass
