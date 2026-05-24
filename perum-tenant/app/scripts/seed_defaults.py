"""Seed per-org defaults (PROVISIONING step 8).

Run inside the tenant container after migrations:
    python -m app.scripts.seed_defaults

Phase 2: Organization meta. Phase 5: a default School + default WorkTypes +
base Subjects (ported from the legacy create_school defaults), so the school
admin sections aren't empty on first login. Idempotent: safe to re-run.
Schools beyond the default are created by org_admin later.
"""

from __future__ import annotations

import asyncio
import logging

from sqlalchemy import func, select

from app.core.config import get_settings
from app.core.db import SessionLocal
from app.models import Organization, School, Subject, WorkType

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("perum.tenant.seed")

DEFAULT_WORK_TYPES = [
    ("Ответ на уроке", 1.0),
    ("Домашняя работа", 1.0),
    ("Самостоятельная работа", 1.5),
    ("Контрольная работа", 2.0),
    ("Проект", 2.0),
    ("Экзамен", 3.0),
]

DEFAULT_SUBJECTS = [
    "Математика",
    "Русский язык",
    "Литература",
    "Физика",
    "Химия",
    "Биология",
    "История",
    "Обществознание",
    "География",
    "Информатика",
    "Английский язык",
    "Физическая культура",
]


async def seed() -> None:
    settings = get_settings()
    name = settings.ORG_NAME or settings.ORG_SLUG
    async with SessionLocal() as db:
        # Organization meta (one row, mirrors the control-plane org).
        org = (
            await db.execute(select(Organization).where(Organization.slug == settings.ORG_SLUG))
        ).scalar_one_or_none()
        if org is None:
            org = Organization(slug=settings.ORG_SLUG, name=name)
            db.add(org)
            await db.commit()
            await db.refresh(org)
            logger.info("seeded organization meta: %s", settings.ORG_SLUG)

        # Default school.
        school = (
            await db.execute(select(School).order_by(School.id).limit(1))
        ).scalar_one_or_none()
        if school is None:
            school = School(org_id=org.id, name=name)
            db.add(school)
            await db.commit()
            await db.refresh(school)
            logger.info("seeded default school id=%s", school.id)

        # Default work types.
        wt_count = await db.scalar(
            select(func.count()).select_from(WorkType).where(WorkType.school_id == school.id)
        )
        if not wt_count:
            for wt_name, weight in DEFAULT_WORK_TYPES:
                db.add(WorkType(school_id=school.id, name=wt_name, weight=weight, is_active=True))
            await db.commit()
            logger.info("seeded %d work types", len(DEFAULT_WORK_TYPES))

        # Base subjects.
        sub_count = await db.scalar(
            select(func.count()).select_from(Subject).where(Subject.school_id == school.id)
        )
        if not sub_count:
            for sub_name in DEFAULT_SUBJECTS:
                db.add(Subject(school_id=school.id, name=sub_name))
            await db.commit()
            logger.info("seeded %d subjects", len(DEFAULT_SUBJECTS))


if __name__ == "__main__":
    asyncio.run(seed())
