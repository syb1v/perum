from __future__ import annotations

import asyncio
import re

import psutil

from app.core.config import Settings
from app.core.docker_client import DockerClient, DockerClientError, HealthSpec
from app.services.stack_spec import StackSpec, school_scanner_relay_name


SCANNER_LABEL = "node-scanner"
CLAMD_CONTAINER = "perum_node_clamd"
UPDATER_CONTAINER = "perum_node_freshclam"
SIGNATURE_VOLUME = "perum_node_clam_signatures"
_node_scanner_lock = asyncio.Lock()
UPDATER_HEALTH = [
    "CMD-SHELL",
    "test -n \"$(find /var/lib/clamav -maxdepth 1 -type f \\( -name 'main.cvd' -o -name 'main.cld' \\) -mmin -2880 -print -quit)\" "
    "&& test -n \"$(find /var/lib/clamav -maxdepth 1 -type f \\( -name 'daily.cvd' -o -name 'daily.cld' \\) -mmin -2880 -print -quit)\" "
    "&& clamscan --database=/var/lib/clamav --version >/dev/null 2>&1",
]


def _pinned(image: str) -> bool:
    return bool(re.fullmatch(r"[^\s]+@sha256:[0-9a-fA-F]{64}", image))


async def ensure_node_scanner(settings: Settings, docker: DockerClient) -> None:
    if not settings.SCANNER_NODE_ENABLED:
        return
    if psutil.virtual_memory().total < 8 * 1024 ** 3:
        raise DockerClientError("scanner-capable node requires at least 8 GiB RAM")
    if not _pinned(settings.SCANNER_CLAMD_IMAGE) or not _pinned(settings.SCANNER_RELAY_IMAGE):
        raise DockerClientError("scanner images must be pinned by sha256 digest")
    async with _node_scanner_lock:
        await docker.create_network(settings.SCANNER_BACKEND_NETWORK, slug=SCANNER_LABEL, internal=True)
        await docker.verify_network(settings.SCANNER_BACKEND_NETWORK, slug=SCANNER_LABEL, internal=True)
        await docker.create_network(settings.SCANNER_UPDATE_NETWORK, slug=SCANNER_LABEL, internal=False)
        await docker.verify_network(settings.SCANNER_UPDATE_NETWORK, slug=SCANNER_LABEL, internal=False)
        await docker.ensure_image(settings.SCANNER_CLAMD_IMAGE)
        await docker.create_volume(SIGNATURE_VOLUME, slug=SCANNER_LABEL)
        if not await docker.container_exists(UPDATER_CONTAINER):
            await docker.run_container(
                name=UPDATER_CONTAINER, image=settings.SCANNER_CLAMD_IMAGE, slug=SCANNER_LABEL, role="freshclam",
                network=settings.SCANNER_UPDATE_NETWORK,
                volumes={SIGNATURE_VOLUME: {"bind": "/var/lib/clamav", "mode": "rw"}},
                health=HealthSpec(test=UPDATER_HEALTH, start_period_s=30, retries=30),
                command=["freshclam", "--daemon", "--foreground", "--config-file=/etc/clamav/freshclam.conf"],
                mem_limit=settings.SCANNER_UPDATER_MEMORY,
                nano_cpus=int(settings.SCANNER_UPDATER_CPUS * 1_000_000_000), cap_drop=["ALL"],
                read_only=True, user=settings.SCANNER_CLAM_USER, security_opt=["no-new-privileges"], pids_limit=32,
            )
        await docker.verify_container(
            UPDATER_CONTAINER, image=settings.SCANNER_CLAMD_IMAGE, slug=SCANNER_LABEL, role="freshclam",
            networks={settings.SCANNER_UPDATE_NETWORK}, mounts={SIGNATURE_VOLUME: ("/var/lib/clamav", "rw")},
            read_only=True, cap_drop={"ALL"}, mem_limit=settings.SCANNER_UPDATER_MEMORY,
            nano_cpus=int(settings.SCANNER_UPDATER_CPUS * 1_000_000_000), require_health=True,
            user=settings.SCANNER_CLAM_USER, security_opt={"no-new-privileges"}, pids_limit=32,
            command=["freshclam", "--daemon", "--foreground", "--config-file=/etc/clamav/freshclam.conf"], health_test=UPDATER_HEALTH,
        )
        await docker.wait_for_healthy(UPDATER_CONTAINER, timeout_s=max(settings.APP_HEALTH_TIMEOUT_S, 300))
        if not await docker.container_exists(CLAMD_CONTAINER):
            await docker.run_container(
                name=CLAMD_CONTAINER, image=settings.SCANNER_CLAMD_IMAGE, slug=SCANNER_LABEL, role="clamd",
                network=settings.SCANNER_BACKEND_NETWORK,
                volumes={SIGNATURE_VOLUME: {"bind": "/var/lib/clamav", "mode": "ro"}},
                health=HealthSpec(test=["CMD-SHELL", "clamdscan --ping 1 >/dev/null 2>&1"]),
                mem_limit=settings.SCANNER_CLAMD_MEMORY,
                nano_cpus=int(settings.SCANNER_CLAMD_CPUS * 1_000_000_000),
                cap_drop=["ALL"],
                read_only=True, user=settings.SCANNER_CLAM_USER, security_opt=["no-new-privileges"], pids_limit=64,
                tmpfs={"/tmp": "rw,noexec,nosuid,size=16m,mode=1777"},
            )
        await docker.verify_container(
            CLAMD_CONTAINER, image=settings.SCANNER_CLAMD_IMAGE, slug=SCANNER_LABEL, role="clamd",
            networks={settings.SCANNER_BACKEND_NETWORK}, mounts={SIGNATURE_VOLUME: ("/var/lib/clamav", "ro")},
            read_only=True, cap_drop={"ALL"}, mem_limit=settings.SCANNER_CLAMD_MEMORY,
            nano_cpus=int(settings.SCANNER_CLAMD_CPUS * 1_000_000_000), require_health=True,
            health_test=["CMD-SHELL", "clamdscan --ping 1 >/dev/null 2>&1"],
            user=settings.SCANNER_CLAM_USER, security_opt={"no-new-privileges"}, pids_limit=64,
            tmpfs={"/tmp": "rw,noexec,nosuid,size=16m,mode=1777"},
        )
        await docker.wait_for_healthy(CLAMD_CONTAINER, timeout_s=settings.APP_HEALTH_TIMEOUT_S)


async def ensure_school_relay(spec: StackSpec, label_slug: str, settings: Settings, docker: DockerClient) -> None:
    if not settings.SCANNER_NODE_ENABLED:
        return
    await ensure_node_scanner(settings, docker)
    name = school_scanner_relay_name(spec.slug)
    await docker.ensure_image(settings.SCANNER_RELAY_IMAGE)
    environment = {
        "LISTEN_PORT": "3310", "UPSTREAM_HOST": CLAMD_CONTAINER, "UPSTREAM_PORT": "3310",
        "MAX_CONNECTIONS": str(settings.SCANNER_RELAY_MAX_CONNECTIONS),
        "MAX_PENDING_CONNECTIONS": str(settings.SCANNER_RELAY_MAX_PENDING_CONNECTIONS),
        "CONNECT_TIMEOUT_S": str(settings.SCANNER_RELAY_CONNECT_TIMEOUT_S),
        "IDLE_TIMEOUT_S": str(settings.SCANNER_RELAY_IDLE_TIMEOUT_S),
        "TOTAL_TIMEOUT_S": str(settings.SCANNER_RELAY_TOTAL_TIMEOUT_S),
        "MAX_BYTES": str(settings.SCANNER_RELAY_MAX_BYTES),
    }
    command = ["python", "-m", "app.scanner_relay"]
    if not await docker.container_exists(name):
        await docker.run_container(
            name=name, image=settings.SCANNER_RELAY_IMAGE, slug=label_slug, role="scanner-relay",
            environment=environment,
            command=command,
            network=spec.network, mem_limit=settings.SCANNER_RELAY_MEMORY,
            nano_cpus=int(settings.SCANNER_RELAY_CPUS * 1_000_000_000), cap_drop=["ALL"], read_only=True,
            user=settings.SCANNER_RELAY_USER, security_opt=["no-new-privileges"], pids_limit=settings.SCANNER_RELAY_PIDS_LIMIT,
        )
        await docker.connect_to_network(name, settings.SCANNER_BACKEND_NETWORK, required=True)
    await docker.verify_container(
        name, image=settings.SCANNER_RELAY_IMAGE, slug=label_slug, role="scanner-relay",
        networks={spec.network, settings.SCANNER_BACKEND_NETWORK}, mounts={}, read_only=True,
        cap_drop={"ALL"}, mem_limit=settings.SCANNER_RELAY_MEMORY,
        nano_cpus=int(settings.SCANNER_RELAY_CPUS * 1_000_000_000), require_health=False,
        user=settings.SCANNER_RELAY_USER, security_opt={"no-new-privileges"}, pids_limit=settings.SCANNER_RELAY_PIDS_LIMIT,
        command=command, environment=environment,
    )
