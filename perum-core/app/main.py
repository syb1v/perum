import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from app.core.config import get_settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("perum.core")

settings = get_settings()


async def _sync_caddy_routes() -> None:
    """Best-effort: re-add Caddy routes for every active org on startup.

    Admin-API route edits don't survive a Caddy restart in dev (Caddy reloads
    from the static Caddyfile), so we heal them here. Failures are non-fatal —
    the control plane must still come up if Caddy is briefly unreachable.
    """
    from app.core.db import SessionLocal
    from app.models import Organization, OrganizationDomain
    from app.services.caddy_admin import get_caddy_admin

    caddy = get_caddy_admin()
    try:
        async with SessionLocal() as db:
            result = await db.execute(
                select(OrganizationDomain, Organization)
                .join(Organization, OrganizationDomain.org_id == Organization.id)
                .where(
                    Organization.status == "active",
                    OrganizationDomain.status == "active",
                )
            )
            rows = result.all()
    except Exception as exc:  # noqa: BLE001
        logger.warning("caddy route sync skipped (DB not ready?): %s", exc)
        return

    for domain, org in rows:
        try:
            await caddy.add_route(org.slug, domain.domain, f"org_{org.slug}_app:3000")
            logger.info("route sync: %s -> org_%s_app:3000", domain.domain, org.slug)
        except Exception as exc:  # noqa: BLE001
            logger.warning("route sync failed for %s: %s", domain.domain, exc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await _sync_caddy_routes()
    yield


app = FastAPI(
    title="PERUM Control Plane",
    version="0.1.0",
    description="Manages organizations, provisioning, billing and observability for PERUM tenant stacks.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from app.routers import health, organizations  # noqa: E402

app.include_router(health.router)
app.include_router(organizations.router, prefix="/api/organizations", tags=["organizations"])


@app.get("/")
async def root() -> dict:
    return {
        "service": settings.APP_NAME,
        "environment": settings.ENVIRONMENT,
        "docs": "/docs",
    }
