"""Minimal tenant app (Phase 1 skeleton).

Exposes health endpoints only. Auth, tenant middleware (org_slug vs hostname),
and the domain modules arrive in Phase 2+. The point of this skeleton is to give
the control-plane provisioner a real image to bring up and migrate.
"""

import logging

from fastapi import FastAPI
from sqlalchemy import text

from app.core.config import get_settings
from app.core.db import engine

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
settings = get_settings()

app = FastAPI(
    title=f"PERUM Tenant — {settings.ORG_SLUG}",
    version="0.1.0",
    description="Per-organization tenant application.",
)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "org": settings.ORG_SLUG}


@app.get("/health/db")
async def health_db() -> dict:
    async with engine.connect() as conn:
        result = await conn.execute(text("SELECT 1"))
        return {"status": "ok", "db": result.scalar_one(), "org": settings.ORG_SLUG}


@app.get("/")
async def root() -> dict:
    return {"service": "perum-tenant", "org": settings.ORG_SLUG, "name": settings.ORG_NAME}
