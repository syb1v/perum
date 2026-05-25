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


async def _seed_bootstrap_admin() -> None:
    """Create the first platform_admin if none exist and a password is configured."""
    if not settings.BOOTSTRAP_ADMIN_PASSWORD:
        return
    from sqlalchemy import func

    from app.core.db import SessionLocal
    from app.core.security import hash_password
    from app.models import PlatformAdmin

    try:
        async with SessionLocal() as db:
            count = await db.scalar(select(func.count()).select_from(PlatformAdmin))
            if count and count > 0:
                return
            db.add(
                PlatformAdmin(
                    login=settings.BOOTSTRAP_ADMIN_LOGIN,
                    password_hash=hash_password(settings.BOOTSTRAP_ADMIN_PASSWORD),
                )
            )
            await db.commit()
            logger.info("seeded bootstrap platform_admin '%s'", settings.BOOTSTRAP_ADMIN_LOGIN)
    except Exception as exc:  # noqa: BLE001
        logger.warning("bootstrap admin seeding skipped: %s", exc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await _seed_bootstrap_admin()
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

from fastapi import Depends  # noqa: E402

from app.core.deps import require_org_admin, require_platform_admin  # noqa: E402
from app.routers import auth, health, organizations, releases, schools  # noqa: E402

app.include_router(health.router)
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(
    organizations.router,
    prefix="/api/organizations",
    tags=["organizations"],
    dependencies=[Depends(require_platform_admin)],
)
# Канал релизов — публикует platform_admin (OTA-обновления школ).
app.include_router(
    releases.router,
    prefix="/api/releases",
    tags=["releases"],
    dependencies=[Depends(require_platform_admin)],
)
# Школы — управляет org_admin (узел орг), скоуп по org_id из токена.
app.include_router(
    schools.router,
    prefix="/api/schools",
    tags=["schools"],
    dependencies=[Depends(require_org_admin)],
)


@app.get("/")
async def root() -> dict:
    return {
        "service": settings.APP_NAME,
        "environment": settings.ENVIRONMENT,
        "docs": "/docs",
    }
