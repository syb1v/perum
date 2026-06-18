"""Генератор bootstrap-скриптов для развёртывания нод."""

from __future__ import annotations

import hashlib
import logging
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models import EnrollmentToken, Node, Organization

logger = logging.getLogger("perum.node_bootstrap")

TEMPLATE_PATH = Path(__file__).parent.parent.parent.parent / "deploy" / "scripts" / "node-bootstrap.sh.tmpl"


async def generate_bootstrap_script(
    db: AsyncSession,
    node: Node,
    org: Organization | None = None,
) -> str:
    settings = get_settings()

    raw_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)

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

    logger.info(
        "Generated bootstrap script for node %s (org=%s, token expires %s)",
        node.name,
        org.slug if org else None,
        expires_at.isoformat(),
    )

    return script
