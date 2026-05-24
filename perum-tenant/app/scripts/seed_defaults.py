"""Seed per-org defaults (PROVISIONING step 8).

Run inside the tenant container after migrations:
    python -m app.scripts.seed_defaults

Phase 2 seeds only the Organization meta row (slug = ORG_SLUG). Default academic
and market data (WorkType, base Subjects, BellSchedule templates, avatar
ShopItems — ported from the legacy monolith) is added here as those models land
in Phases 5-7. Schools are NOT created automatically — org_admin creates them.
Idempotent: safe to re-run.
"""

from __future__ import annotations

import asyncio
import logging

from sqlalchemy import select

from app.core.config import get_settings
from app.core.db import SessionLocal
from app.models import Organization

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("perum.tenant.seed")


async def seed() -> None:
    settings = get_settings()
    async with SessionLocal() as db:
        result = await db.execute(
            select(Organization).where(Organization.slug == settings.ORG_SLUG)
        )
        if result.scalar_one_or_none() is not None:
            logger.info("organization meta already present: %s", settings.ORG_SLUG)
            return
        db.add(Organization(slug=settings.ORG_SLUG, name=settings.ORG_NAME or settings.ORG_SLUG))
        await db.commit()
        logger.info("seeded organization meta: %s", settings.ORG_SLUG)


if __name__ == "__main__":
    asyncio.run(seed())
