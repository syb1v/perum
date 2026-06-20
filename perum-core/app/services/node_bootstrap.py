"""Генератор bootstrap-скрипта ноды (ROLE=org_agent).

Скрипт самодостаточен: ставит Docker (если нет), пишет docker-compose.yml + Caddyfile
+ .env и поднимает стек ноды (воркер + локальная БД + redis + docker_proxy + caddy).
Воркер при старте делает enroll в ядро и затем по командам ядра (/api/agent/*)
разворачивает/обновляет школьные стеки ПРЯМО НА НОДЕ. Маршрут школы на платформе
проксирует <slug>.<base> → нода:80 (платформа терминирует TLS). Проверено вживую.
"""

from __future__ import annotations

import hashlib
import logging
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models import EnrollmentToken, Node, Organization, Release

logger = logging.getLogger("perum.node_bootstrap")


def _public_core_url(settings) -> str:
    return settings.PUBLIC_CORE_URL or f"https://admin.{settings.PUBLIC_BASE_DOMAIN}"


# docker-compose.yml ноды. Плейсхолдеры {{...}} подставляются генератором; ${...} —
# переменные из .env (раскрываются docker compose на ноде).
COMPOSE_TEMPLATE = """\
name: perum-node

services:
  perum_agent:
    image: {{ agent_image }}
    container_name: perum_agent
    restart: unless-stopped
    pull_policy: always
    environment:
      ROLE: "org_agent"
      ENROLLMENT_TOKEN: "${ENROLLMENT_TOKEN}"
      AGENT_TOKEN: "${AGENT_TOKEN}"
      CORE_URL: "{{ core_url }}"
      CONTROL_PLANE_URL: "{{ core_url }}"
      DATABASE_URL: "postgresql+asyncpg://perum:${NODE_DB_PW}@perum_node_db:5432/perum_node"
      SECRET_KEY: "${SECRET_KEY}"
      DOCKER_HOST: "tcp://docker_proxy:2375"
      CADDY_ADMIN_URL: "http://caddy:2019"
      SHARED_REDIS_URL: "redis://shared_redis:6379"
      PUBLIC_BASE_DOMAIN: "{{ base_domain }}"
      DOCKER_NETWORK: "perum_internal"
      IMAGE_REGISTRY: "{{ image_registry }}"
      TENANT_IMAGE: "${TENANT_IMAGE}"
    ports:
      - "{{ agent_port }}:3000"
    depends_on:
      perum_node_db:
        condition: service_healthy
      docker_proxy:
        condition: service_started
    networks:
      - perum_internal
    command:
      - sh
      - -c
      - |
        alembic upgrade head &&
        exec uvicorn app.main:app --host 0.0.0.0 --port 3000 --proxy-headers --forwarded-allow-ips=*

  perum_node_db:
    image: {{ image_registry }}/library/postgres:15-alpine
    container_name: perum_node_db
    restart: unless-stopped
    environment:
      POSTGRES_USER: perum
      POSTGRES_PASSWORD: "${NODE_DB_PW}"
      POSTGRES_DB: perum_node
    volumes:
      - node_pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U perum -d perum_node"]
      interval: 5s
      timeout: 3s
      retries: 10
    networks:
      - perum_internal

  shared_redis:
    image: {{ image_registry }}/library/redis:7-alpine
    container_name: shared_redis
    restart: unless-stopped
    command: ["redis-server", "--maxmemory", "128mb", "--maxmemory-policy", "allkeys-lru"]
    networks:
      - perum_internal

  docker_proxy:
    image: tecnativa/docker-socket-proxy:0.3
    container_name: docker_proxy
    restart: unless-stopped
    environment:
      CONTAINERS: 1
      IMAGES: 1
      VOLUMES: 1
      NETWORKS: 1
      EXEC: 1
      POST: 1
      VERSION: 1
      PING: 1
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    networks:
      - perum_internal

  caddy:
    image: {{ image_registry }}/library/caddy:2-alpine
    container_name: caddy
    restart: unless-stopped
    ports:
      - "80:80"
    volumes:
      - ./caddy/Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    networks:
      - perum_internal

volumes:
  node_pgdata:
  caddy_data:
  caddy_config:

networks:
  perum_internal:
    name: perum_internal
    driver: bridge
"""

# Caddyfile ноды: admin для управления маршрутами воркером + :80-сервер с catch-all
# (нужен непустой routes-массив, иначе вставка маршрута школы падает с 500).
CADDYFILE = """\
{
\tadmin 0.0.0.0:2019
\tauto_https off
}

:80 {
\trespond "PERUM node OK" 200
}
"""

SCRIPT_TEMPLATE = """\
#!/usr/bin/env bash
# ПЭРУМ — установка ноды «{{ node_name }}» (org={{ org_slug }}). Запуск под root:
#   bash {{ filename }}
# Скрипт идемпотентен: ставит Docker (если нет), разворачивает стек ноды и подключает
# её к ядру. Токен подключения вшит — вводить ничего не нужно.
set -euo pipefail

DIR=/opt/perum-node
echo "==> ПЭРУМ нода: {{ node_name }}"

if ! command -v docker >/dev/null 2>&1; then
  echo "==> Ставлю Docker…"
  curl -fsSL https://get.docker.com | sh
fi

mkdir -p "$DIR/caddy"
cd "$DIR"

NODE_DB_PW=$(openssl rand -hex 16)
SECRET_KEY=$(openssl rand -hex 24)
cat > .env <<ENVEOF
ENROLLMENT_TOKEN={{ enrollment_token }}
AGENT_TOKEN={{ agent_token }}
TENANT_IMAGE={{ tenant_image }}
NODE_DB_PW=$NODE_DB_PW
SECRET_KEY=$SECRET_KEY
ENVEOF

cat > docker-compose.yml <<'COMPOSEEOF'
{{ compose }}
COMPOSEEOF

cat > caddy/Caddyfile <<'CADDYEOF'
{{ caddyfile }}
CADDYEOF

echo "==> Поднимаю стек ноды…"
docker compose pull >/dev/null 2>&1 || true
docker compose up -d

echo "==> Готово. Проверка через ~30с: docker ps; docker logs perum_agent"
echo "    Нода подключится к ядру и появится как active в разделе «Инфраструктура»."
"""


@dataclass
class BootstrapResult:
    script: str
    docker_compose: str
    enrollment_token: str


def _render_compose(settings) -> str:
    out = COMPOSE_TEMPLATE
    out = out.replace("{{ agent_image }}", settings.AGENT_IMAGE)
    out = out.replace("{{ core_url }}", _public_core_url(settings))
    out = out.replace("{{ base_domain }}", settings.PUBLIC_BASE_DOMAIN)
    out = out.replace("{{ image_registry }}", settings.IMAGE_REGISTRY)
    out = out.replace("{{ agent_port }}", str(settings.AGENT_PORT))
    return out


async def generate_bootstrap_script(
    db: AsyncSession,
    node: Node,
    org: Organization | None = None,
) -> BootstrapResult:
    settings = get_settings()

    raw_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    expires_at = datetime.utcnow() + timedelta(days=7)

    enrollment_token = EnrollmentToken(
        org_id=org.id if org else None,
        token_hash=token_hash,
        expires_at=expires_at,
    )
    db.add(enrollment_token)
    await db.commit()
    await db.refresh(enrollment_token)

    node.enrollment_token_id = enrollment_token.id
    await db.commit()

    # Образ тенанта для школ на ноде = текущий релиз (пуллящийся из реестра).
    current = await db.scalar(
        select(Release).where(Release.channel == "stable", Release.is_current.is_(True)).limit(1)
    )
    tenant_image = (current.image or current.version_tag) if current else settings.TENANT_IMAGE

    compose = _render_compose(settings)
    filename = f"perum-node-{node.name}-bootstrap.sh"
    script = SCRIPT_TEMPLATE
    script = script.replace("{{ node_name }}", node.name)
    script = script.replace("{{ org_slug }}", org.slug if org else "pool")
    script = script.replace("{{ filename }}", filename)
    script = script.replace("{{ enrollment_token }}", raw_token)
    script = script.replace("{{ agent_token }}", settings.AGENT_TOKEN)
    script = script.replace("{{ tenant_image }}", tenant_image)
    script = script.replace("{{ compose }}", compose)
    script = script.replace("{{ caddyfile }}", CADDYFILE)

    logger.info("Generated bootstrap for node %s (org=%s)", node.name, org.slug if org else None)
    return BootstrapResult(script=script, docker_compose=compose, enrollment_token=raw_token)
