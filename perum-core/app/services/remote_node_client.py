"""HTTP-клиент для управления школами на удалённой ноде через агент."""

from __future__ import annotations

import logging

import httpx

from app.models import Node

logger = logging.getLogger("perum.remote_node")


class RemoteNodeClient:
    """Клиент для отправки команд агенту на удалённой ноде."""

    def __init__(self, timeout: float = 30.0):
        self.timeout = timeout

    def _get_agent_url(self, node: Node, path: str) -> str:
        return f"http://{node.hostname}:3000/agent/{path.lstrip('/')}"

    async def _request(
        self,
        node: Node,
        method: str,
        path: str,
        json: dict | None = None,
    ) -> dict:
        url = self._get_agent_url(node, path)
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.request(method, url, json=json)
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

    async def get_schools(self, node: Node) -> dict:
        return await self._request(node, "GET", "/schools")

    async def get_health(self, node: Node) -> dict:
        return await self._request(node, "GET", "/health")

    async def ping(self, node: Node) -> bool:
        try:
            await self._request(node, "GET", "/whoami")
            return True
        except Exception:
            return False


class RemoteNodeError(Exception):
    pass
