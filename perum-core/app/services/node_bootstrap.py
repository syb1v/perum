"""Генератор bootstrap-скриптов и docker-compose для развёртывания нод."""

from __future__ import annotations

import hashlib
import logging
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models import EnrollmentToken, Node, Organization

logger = logging.getLogger("perum.node_bootstrap")

TEMPLATE_PATH = Path(__file__).parent.parent.parent / "deploy" / "scripts" / "node-bootstrap.sh.tmpl"

DOCKER_COMPOSE_TEMPLATE = """\
# ПЭРУМ — Нода: {{ node_name }}
# Сгенерировано: {{ generated_at }}
# Команда запуска: docker compose up -d

version: "3.9"

services:
  perum_agent:
    image: ghcr.io/perum/perum-core:{{ release_tag }}
    container_name: perum_agent
    restart: unless-stopped
    environment:
      ROLE: "org_agent"
      ENROLLMENT_TOKEN: "{{ enrollment_token }}"
      CORE_URL: "{{ core_url }}"
      DATABASE_URL: "postgresql+asyncpg://perum:{{ db_password }}@perum_node_db:5432/perum_node"
      SECRET_KEY: "{{ secret_key }}"
    ports:
      - "3001:3000"
    depends_on:
      perum_node_db:
        condition: service_healthy
    networks:
      - perum_net

  perum_node_db:
    image: postgres:16-alpine
    container_name: perum_node_db
    restart: unless-stopped
    environment:
      POSTGRES_DB: "perum_node"
      POSTGRES_USER: "perum"
      POSTGRES_PASSWORD: "{{ db_password }}"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U perum -d perum_node"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - perum_net

volumes:
  pgdata:

networks:
  perum_net:
    driver: bridge
"""


@dataclass
class BootstrapResult:
    script: str
    docker_compose: str
    enrollment_token: str


def _generate_docker_compose(
    node: Node,
    enrollment_token: str,
    core_url: str,
    release_tag: str,
) -> str:
    db_password = secrets.token_urlsafe(24)
    secret_key = secrets.token_urlsafe(32)
    generated_at = datetime.now(timezone.utc).isoformat()

    result = DOCKER_COMPOSE_TEMPLATE
    result = result.replace("{{ node_name }}", node.name)
    result = result.replace("{{ generated_at }}", generated_at)
    result = result.replace("{{ release_tag }}", release_tag)
    result = result.replace("{{ enrollment_token }}", enrollment_token)
    result = result.replace("{{ core_url }}", core_url)
    result = result.replace("{{ db_password }}", db_password)
    result = result.replace("{{ secret_key }}", secret_key)
    return result


async def generate_bootstrap_script(
    db: AsyncSession,
    node: Node,
    org: Organization | None = None,
) -> BootstrapResult:
    settings = get_settings()

    raw_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    # Колонка enrollment_tokens.expires_at — DateTime БЕЗ таймзоны (как везде в проекте,
    # ср. enroll.py: `row.expires_at < datetime.utcnow()`). Передать сюда aware-datetime
    # нельзя — asyncpg падает «can't subtract offset-naive and offset-aware datetimes».
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

    template_content = TEMPLATE_PATH.read_text()

    release_tag = "latest"
    if org:
        from sqlalchemy import select
        from app.models import Release

        current_release = await db.scalar(
            select(Release).where(Release.is_current == True).order_by(Release.id.desc())
        )
        if current_release:
            release_tag = current_release.version_tag

    script = template_content.replace("{{ node_name }}", node.name)
    script = script.replace("{{ enrollment_token }}", raw_token)
    script = script.replace("{{ core_url }}", settings.CONTROL_PLANE_URL)
    script = script.replace("{{ org_slug }}", org.slug if org else "unknown")
    script = script.replace("{{ release_tag }}", release_tag)
    script = script.replace("{{ public_base_domain }}", settings.PUBLIC_BASE_DOMAIN)
    script = script.replace("{{ generated_at }}", datetime.now(timezone.utc).isoformat())

    docker_compose = _generate_docker_compose(
        node=node,
        enrollment_token=raw_token,
        core_url=settings.CONTROL_PLANE_URL,
        release_tag=release_tag,
    )

    logger.info(
        "Generated bootstrap script for node %s (org=%s, token expires %s)",
        node.name,
        org.slug if org else None,
        expires_at.isoformat(),
    )

    return BootstrapResult(
        script=script,
        docker_compose=docker_compose,
        enrollment_token=raw_token,
    )
