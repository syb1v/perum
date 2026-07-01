"""Manage per-org routes on the central Caddy via its admin API.

The dev Caddy is configured from a static Caddyfile (a server on :80 with the
admin.perum.local route + a catch-all responder, and a :443 server). Org routes
are added at runtime through the admin API (http://caddy:2019).

Two important details:

* We insert each org route at **index 0** of the :80 server's route list, so a
  host-matched, ``terminal`` route is always evaluated before the catch-all
  responder that would otherwise swallow the request.
* Each route carries an ``@id`` of ``perum-org-<slug>`` so it can be removed
  with ``DELETE /id/perum-org-<slug>`` regardless of its current index.

Caveat (dev): admin-API edits live in Caddy's running config, not the mounted
Caddyfile, so a Caddy container restart drops them. The control plane re-syncs
active routes on startup (see app.main) to heal this.
"""

from __future__ import annotations

import httpx

from app.core.config import get_settings

settings = get_settings()


class CaddyAdminError(RuntimeError):
    pass


def route_id(slug: str) -> str:
    return f"perum-org-{slug}"


# Paths routed to the org's tenant app; everything else goes to the frontend.
# /internal/* is deliberately NOT exposed publicly — the control plane reaches
# it directly over the docker network (org_<slug>_app:3000).
_BACKEND_PATHS = ["/api/*", "/docs", "/docs/*", "/openapi.json", "/health", "/health/*"]


def _build_route(slug: str, host: str, app_upstream: str, web_upstream: str) -> dict:
    """Host route that splits /api+/docs to the org app and the rest to the UI."""
    return {
        "@id": route_id(slug),
        "match": [{"host": [host]}],
        "handle": [
            {
                "handler": "subroute",
                "routes": [
                    {
                        "match": [{"path": _BACKEND_PATHS}],
                        "handle": [
                            {"handler": "reverse_proxy", "upstreams": [{"dial": app_upstream}]}
                        ],
                    },
                    {
                        "handle": [
                            {"handler": "reverse_proxy", "upstreams": [{"dial": web_upstream}]}
                        ]
                    },
                ],
            }
        ],
        "terminal": True,
    }


class CaddyAdmin:
    def __init__(self, base_url: str | None = None, *, listen_suffix: str = ":80") -> None:
        self.base_url = (base_url or settings.CADDY_ADMIN_URL).rstrip("/")
        self.listen_suffix = listen_suffix

    async def _http_server_name(self, client: httpx.AsyncClient) -> str:
        resp = await client.get(f"{self.base_url}/config/apps/http/servers")
        resp.raise_for_status()
        servers = resp.json() or {}
        for name, cfg in servers.items():
            listens = cfg.get("listen", []) or []
            if any(str(l).endswith(self.listen_suffix) for l in listens):
                return name
        if servers:
            return next(iter(servers))
        raise CaddyAdminError("no HTTP servers configured in Caddy")

    async def add_route(self, slug: str, host: str, app_upstream: str) -> None:
        """Insert (or replace) the org route at the front of the :80 server.

        Splits the host: /api + /docs → the org's tenant app (app_upstream),
        everything else → the shared frontend (settings.WEB_UPSTREAM)."""
        # Defense-in-depth: маршрут школы/кастомного домена НИКОГДА не должен
        # перекрывать платформенные хосты (консоль ядра / апекс-лендинг). Slug
        # школы уже валидируется, но кастомный домен мог бы прийти как admin.<base>.
        base = settings.PUBLIC_BASE_DOMAIN.lower()
        if host.lower() in {base, f"admin.{base}", f"www.{base}"}:
            raise CaddyAdminError(f"host '{host}' зарезервирован платформой")
        async with httpx.AsyncClient(timeout=10.0) as client:
            # Remove any stale route with the same id first to keep @id unique.
            await self._delete_id(client, route_id(slug), ignore_missing=True)
            server = await self._http_server_name(client)
            route = _build_route(slug, host, app_upstream, settings.WEB_UPSTREAM)
            resp = await client.put(
                f"{self.base_url}/config/apps/http/servers/{server}/routes/0",
                json=route,
            )
            if resp.status_code >= 300:
                raise CaddyAdminError(
                    f"failed to add Caddy route for {host}: "
                    f"{resp.status_code} {resp.text}"
                )

    async def add_proxy_route(self, slug: str, host: str, upstream: str) -> None:
        """Простой маршрут: ВСЕ пути host → один upstream (для лендинга орг — там нет
        разделения /api/web). Вставляется первым (terminal), id `perum-org-<slug>`."""
        base = settings.PUBLIC_BASE_DOMAIN.lower()
        if host.lower() in {base, f"admin.{base}", f"www.{base}"}:
            raise CaddyAdminError(f"host '{host}' зарезервирован платформой")
        async with httpx.AsyncClient(timeout=10.0) as client:
            await self._delete_id(client, route_id(slug), ignore_missing=True)
            server = await self._http_server_name(client)
            route = {
                "@id": route_id(slug),
                "match": [{"host": [host]}],
                "handle": [{"handler": "reverse_proxy", "upstreams": [{"dial": upstream}]}],
                "terminal": True,
            }
            resp = await client.put(
                f"{self.base_url}/config/apps/http/servers/{server}/routes/0", json=route
            )
            if resp.status_code >= 300:
                raise CaddyAdminError(f"failed to add proxy route for {host}: {resp.status_code} {resp.text}")

    async def add_maintenance_route(self, slug: str, host: str, *, message: str = "Школа временно приостановлена") -> None:
        """Заменить маршрут школы на терминальный ответ 503 (заморозка). Контейнер
        остановлен, но хост отдаёт понятную страницу вместо 502 Bad Gateway."""
        async with httpx.AsyncClient(timeout=10.0) as client:
            await self._delete_id(client, route_id(slug), ignore_missing=True)
            server = await self._http_server_name(client)
            route = {
                "@id": route_id(slug),
                "match": [{"host": [host]}],
                "handle": [{"handler": "static_response", "status_code": 503, "body": message}],
                "terminal": True,
            }
            resp = await client.put(
                f"{self.base_url}/config/apps/http/servers/{server}/routes/0", json=route
            )
            if resp.status_code >= 300:
                raise CaddyAdminError(
                    f"failed to add maintenance route for {host}: {resp.status_code} {resp.text}"
                )

    async def remove_route(self, slug: str) -> None:
        async with httpx.AsyncClient(timeout=10.0) as client:
            await self._delete_id(client, route_id(slug), ignore_missing=True)

    async def route_exists(self, slug: str) -> bool:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{self.base_url}/id/{route_id(slug)}")
            return resp.status_code == 200

    async def _delete_id(
        self, client: httpx.AsyncClient, rid: str, *, ignore_missing: bool
    ) -> None:
        resp = await client.delete(f"{self.base_url}/id/{rid}")
        if resp.status_code == 200:
            return
        # Caddy returns 500 with "unknown object ID" when the id is absent.
        if ignore_missing and (resp.status_code == 404 or "unknown object" in resp.text.lower()):
            return
        if resp.status_code >= 300:
            raise CaddyAdminError(
                f"failed to delete Caddy route {rid}: {resp.status_code} {resp.text}"
            )


_caddy_admin: CaddyAdmin | None = None


def get_caddy_admin() -> CaddyAdmin:
    global _caddy_admin
    if _caddy_admin is None:
        _caddy_admin = CaddyAdmin()
    return _caddy_admin
