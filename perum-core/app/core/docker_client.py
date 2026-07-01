"""Thin async wrapper over the Docker SDK (docker-py).

The control plane provisions per-org stacks by talking to the host Docker
daemon through the mounted socket (`/var/run/docker.sock`). docker-py is a
blocking library, so every call is offloaded to a thread with
``asyncio.to_thread`` to avoid stalling the event loop.

We deliberately create containers directly (not via the ``docker compose``
CLI): the SDK is already a dependency, it keeps the slim control-plane image
free of the docker CLI + compose plugin, and it gives us precise programmatic
control over health polling and exec. The human-readable compose manifest for a
stack can still be produced on demand — see ``app.services.stack_spec``.

Every resource we create is tagged with ``com.perum.org=<slug>`` so cleanup can
find and remove an org's containers and volumes by label.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass

import docker
from docker.errors import ImageNotFound, NotFound
from docker.models.containers import Container
from docker.types import Healthcheck

LABEL_ORG = "com.perum.org"
LABEL_ROLE = "com.perum.role"
LABEL_MANAGED = "com.perum.managed"


class DockerClientError(RuntimeError):
    """Raised for docker operations that fail in a way worth surfacing."""


@dataclass
class HealthSpec:
    test: list[str]
    interval_s: float = 5.0
    timeout_s: float = 3.0
    retries: int = 10
    start_period_s: float = 2.0

    def to_docker(self) -> Healthcheck:
        s = 1_000_000_000  # seconds → nanoseconds
        return Healthcheck(
            test=self.test,
            interval=int(self.interval_s * s),
            timeout=int(self.timeout_s * s),
            retries=self.retries,
            start_period=int(self.start_period_s * s),
        )


class DockerClient:
    """Lazily-connected wrapper around a single docker-py client."""

    def __init__(self) -> None:
        self._client: docker.DockerClient | None = None

    @property
    def client(self) -> docker.DockerClient:
        if self._client is None:
            # from_env honours DOCKER_HOST, falling back to the unix socket.
            self._client = docker.from_env()
        return self._client

    async def ping(self) -> bool:
        return await asyncio.to_thread(self.client.ping)

    async def list_containers(self, all: bool = False) -> list[dict]:
        """Список контейнеров в низкоуровневом формате Docker API (dict с ключами
        Names/Labels/State/Status). Используется агентом ноды для /health и /schools.
        Через docker_proxy открыт ручкой CONTAINERS=1."""
        def _list() -> list[dict]:
            return self.client.api.containers(all=all)

        return await asyncio.to_thread(_list)

    async def ensure_network(self, name: str) -> None:
        def _check() -> None:
            try:
                self.client.networks.get(name)
            except NotFound as exc:  # pragma: no cover - infra precondition
                raise DockerClientError(
                    f"docker network '{name}' does not exist; it is created by "
                    f"deploy/docker-compose.core.yml"
                ) from exc

        await asyncio.to_thread(_check)

    async def ensure_image(self, image: str, *, allow_pull: bool = True) -> None:
        def _ensure() -> None:
            try:
                self.client.images.get(image)
                return
            except ImageNotFound:
                pass
            if not allow_pull:
                raise DockerClientError(f"image '{image}' not found locally")
            try:
                self.client.images.pull(image)
            except Exception as exc:  # noqa: BLE001 - re-raise with context
                raise DockerClientError(
                    f"image '{image}' not present locally and pull failed: {exc}. "
                    f"If this is a locally-built image (e.g. perum-tenant:dev), "
                    f"build it before provisioning."
                ) from exc

        await asyncio.to_thread(_ensure)

    async def create_volume(self, name: str, *, slug: str) -> None:
        """Create the named volume if absent (idempotent across retries)."""

        def _create() -> None:
            try:
                self.client.volumes.get(name)
                return
            except NotFound:
                pass
            self.client.volumes.create(
                name=name,
                labels={LABEL_ORG: slug, LABEL_MANAGED: "true"},
            )

        await asyncio.to_thread(_create)

    async def run_container(
        self,
        *,
        name: str,
        image: str,
        slug: str,
        role: str,
        environment: dict[str, str] | None = None,
        volumes: dict[str, dict[str, str]] | None = None,
        health: HealthSpec | None = None,
        network: str,
        restart: str = "unless-stopped",
    ) -> str:
        labels = {LABEL_ORG: slug, LABEL_ROLE: role, LABEL_MANAGED: "true"}

        def _run() -> Container:
            return self.client.containers.run(
                image=image,
                name=name,
                detach=True,
                environment=environment or {},
                volumes=volumes or {},
                labels=labels,
                network=network,
                restart_policy={"Name": restart},
                healthcheck=health.to_docker() if health else None,
            )

        container = await asyncio.to_thread(_run)
        return container.id

    async def wait_for_healthy(self, name: str, *, timeout_s: int) -> None:
        """Poll a container until its healthcheck reports healthy.

        A container with no healthcheck is treated as healthy once it is
        ``running`` (used as a fallback; our stacks always define one).
        """

        def _probe() -> tuple[str, str | None]:
            container = self.client.containers.get(name)
            state = container.attrs.get("State", {})
            status = state.get("Status", "unknown")
            health = (state.get("Health") or {}).get("Status")
            return status, health

        deadline = asyncio.get_event_loop().time() + timeout_s
        last: tuple[str, str | None] = ("unknown", None)
        while asyncio.get_event_loop().time() < deadline:
            last = await asyncio.to_thread(_probe)
            status, health = last
            if health == "healthy":
                return
            if health is None and status == "running":
                return
            if status in ("exited", "dead"):
                raise DockerClientError(
                    f"container '{name}' is '{status}' before becoming healthy"
                )
            await asyncio.sleep(1.5)
        raise DockerClientError(
            f"container '{name}' did not become healthy within {timeout_s}s "
            f"(last status={last[0]!r}, health={last[1]!r})"
        )

    async def exec(
        self, name: str, cmd: list[str], *, workdir: str | None = None
    ) -> tuple[int, str]:
        def _exec() -> tuple[int, str]:
            container = self.client.containers.get(name)
            exit_code, output = container.exec_run(cmd=cmd, workdir=workdir, demux=False)
            text = output.decode("utf-8", errors="replace") if output else ""
            return exit_code, text

        return await asyncio.to_thread(_exec)

    async def remove_containers(self, slug: str) -> list[str]:
        """Remove the org's containers but keep its data volume.

        Used as a defensive clean slate before (re)provisioning, so a fresh
        attempt reuses the existing Postgres volume rather than wiping it.
        """

        def _remove() -> list[str]:
            removed: list[str] = []
            for c in self.client.containers.list(
                all=True, filters={"label": f"{LABEL_ORG}={slug}"}
            ):
                try:
                    c.remove(force=True)
                    removed.append(f"container:{c.name}")
                except NotFound:
                    pass
            return removed

        return await asyncio.to_thread(_remove)

    async def remove_stack(self, slug: str) -> list[str]:
        """Stop+remove all containers AND volumes labelled for this org.

        Idempotent: returns the names of removed resources; absent resources are
        silently ignored. Used for deprovisioning and for cleanup after a failed
        provision (matches `docker compose down -v`).
        """

        def _remove() -> list[str]:
            removed: list[str] = []
            for c in self.client.containers.list(
                all=True, filters={"label": f"{LABEL_ORG}={slug}"}
            ):
                try:
                    c.remove(force=True)
                    removed.append(f"container:{c.name}")
                except NotFound:
                    pass
            for v in self.client.volumes.list(filters={"label": f"{LABEL_ORG}={slug}"}):
                try:
                    v.remove(force=True)
                    removed.append(f"volume:{v.name}")
                except NotFound:
                    pass
            return removed

        return await asyncio.to_thread(_remove)

    async def container_exists(self, name: str) -> bool:
        def _check() -> bool:
            try:
                self.client.containers.get(name)
                return True
            except NotFound:
                return False

        return await asyncio.to_thread(_check)

    async def volume_exists(self, name: str) -> bool:
        def _check() -> bool:
            try:
                self.client.volumes.get(name)
                return True
            except NotFound:
                return False

        return await asyncio.to_thread(_check)

    async def stop_containers(self, slug: str) -> list[str]:
        """Stop (но НЕ удалять) все контейнеры стека — для заморозки школы.
        Тома и сами контейнеры сохраняются; start_containers поднимает обратно."""

        def _stop() -> list[str]:
            stopped: list[str] = []
            for c in self.client.containers.list(all=True, filters={"label": f"{LABEL_ORG}={slug}"}):
                try:
                    c.stop(timeout=10)
                    stopped.append(f"container:{c.name}")
                except NotFound:
                    pass
            return stopped

        return await asyncio.to_thread(_stop)

    async def start_containers(self, slug: str) -> list[str]:
        """Start ранее остановленные контейнеры стека — для разморозки школы."""

        def _start() -> list[str]:
            started: list[str] = []
            for c in self.client.containers.list(all=True, filters={"label": f"{LABEL_ORG}={slug}"}):
                try:
                    c.start()
                    started.append(f"container:{c.name}")
                except NotFound:
                    pass
            return started

        return await asyncio.to_thread(_start)

    async def restart_managed_containers(self) -> list[str]:
        """Перезагрузить ВСЕ управляемые ПЭРУМ-контейнеры на этой ноде (стеки школ).
        Используется при «перезагрузке ноды» — это рестарт docker-стека, а не сервера."""

        def _restart() -> list[str]:
            restarted: list[str] = []
            for c in self.client.containers.list(all=True, filters={"label": f"{LABEL_MANAGED}=true"}):
                try:
                    c.restart(timeout=10)
                    restarted.append(f"container:{c.name}")
                except NotFound:
                    pass
            return restarted

        return await asyncio.to_thread(_restart)

    async def restart_node_stack_except_self(self, *, self_service: str = "perum_agent") -> tuple[list[str], str | None]:
        """Перезагрузить все контейнеры стека ноды (по compose-проекту) КРОМЕ самого
        воркора. Возвращает (список перезапущенных, имя своего контейнера) — воркор
        перезапускается отдельно и ПОСЛЕ отправки ответа (см. agent.service)."""

        def _restart() -> tuple[list[str], str | None]:
            restarted: list[str] = []
            project = "perum-node"
            self_name: str | None = None
            # Имя своего контейнера — по hostname (= id контейнера) либо по service-лейблу.
            for c in self.client.containers.list(all=True):
                svc = c.labels.get("com.docker.compose.service")
                proj = c.labels.get("com.docker.compose.project")
                if svc == self_service and proj:
                    project = proj
            members = self.client.containers.list(
                all=True, filters={"label": f"com.docker.compose.project={project}"}
            )
            for c in members:
                if c.labels.get("com.docker.compose.service") == self_service:
                    self_name = c.name
                    continue
                try:
                    c.restart(timeout=10)
                    restarted.append(f"container:{c.name}")
                except NotFound:
                    pass
            return restarted, self_name

        return await asyncio.to_thread(_restart)

    async def restart_self(self, name: str) -> None:
        """Перезапустить собственный контейнер воркора (вызывается в фоне, после ответа)."""
        def _restart() -> None:
            try:
                self.client.containers.get(name).restart(timeout=5)
            except Exception:  # noqa: BLE001
                pass
        await asyncio.to_thread(_restart)

    async def backup_volume_tar(self, volume: str, image: str) -> bytes:
        """Снять tar.gz содержимого тома (для бэкапа вложений школы перед purge).
        Запускает одноразовый контейнер с томом, смонтированным RO в /data, и tar'ит
        его в stdout; возвращает gzip-байты. Пустой том → валидный пустой архив."""

        def _run() -> bytes:
            # БЕЗ `|| true`: ненулевой выход tar (ошибка чтения/места/OOM) должен
            # поднять docker.errors.ContainerError, иначе бэкап «успешен» пустым и
            # тома снесутся с потерей вложений (AUDIT-fix review).
            # demux=True: docker возвращает мультиплексированный поток (8-байтные
            # фрейм-заголовки на не-TTY контейнере). Через docker-socket-proxy ноды
            # docker-py НЕ демультиплексирует сам → в stdout попадал заголовок фрейма
            # и gzip-magic «съезжал» (бэкап на ноде падал как «не gzip»). С demux
            # клиент возвращает кортеж (stdout, stderr) с уже чистыми потоками.
            out = self.client.containers.run(
                image=image,
                command=["sh", "-c", "tar czf - -C /data ."],
                volumes={volume: {"bind": "/data", "mode": "ro"}},
                remove=True,
                detach=False,
                stdout=True,
                stderr=True,
                demux=True,
                network_disabled=True,
            )
            stdout_data, _stderr = out if isinstance(out, tuple) else (out, None)
            return stdout_data or b""

        return await asyncio.to_thread(_run)

    async def remove_container(self, name: str) -> bool:
        """Remove a SINGLE container by name (keep volumes). Used for OTA-обновления:
        свап app-контейнера на новый образ, не трогая БД и её том."""

        def _remove() -> bool:
            try:
                self.client.containers.get(name).remove(force=True)
                return True
            except NotFound:
                return False

        return await asyncio.to_thread(_remove)


_docker_client: DockerClient | None = None


def get_docker_client() -> DockerClient:
    global _docker_client
    if _docker_client is None:
        _docker_client = DockerClient()
    return _docker_client
