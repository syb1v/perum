"""Minimal tenant app (Phase 1 skeleton).

Exposes health endpoints only. Auth, tenant middleware (org_slug vs hostname),
and the domain modules arrive in Phase 2+. The point of this skeleton is to give
the control-plane provisioner a real image to bring up and migrate.
"""

import asyncio
import contextlib
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from sqlalchemy import text

from app.core.config import get_settings
from app.core.db import engine

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("perum.tenant")
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Фоновая телеметрия в ядро (агрегаты без PII). Запускается, только если задан
    # TELEMETRY_TOKEN и интервал > 0; иначе тихо пропускается (dev/standalone).
    task = None
    if settings.TELEMETRY_TOKEN and settings.TELEMETRY_INTERVAL_S > 0:
        from app.telemetry import telemetry_loop

        task = asyncio.create_task(telemetry_loop())
        logger.info("telemetry loop started (interval=%ss)", settings.TELEMETRY_INTERVAL_S)
    try:
        yield
    finally:
        if task is not None:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task


app = FastAPI(
    title=f"PERUM Tenant — {settings.ORG_SLUG}",
    version="0.1.0",
    description="Per-organization tenant application.",
    lifespan=lifespan,
)

from app.internal.router import router as internal_router  # noqa: E402
from app.modules.analytics.router import admin_router as analytics_admin_router  # noqa: E402
from app.modules.analytics.router import teacher_router as analytics_teacher_router  # noqa: E402
from app.modules.appeals.router import router as appeals_router  # noqa: E402
from app.modules.auth.router import router as auth_router  # noqa: E402
from app.modules.common.router import router as common_router  # noqa: E402
from app.modules.coursework.router import router as coursework_router  # noqa: E402
from app.modules.exchange.router import router as exchange_router  # noqa: E402

from app.modules.journal.router import router as journal_router  # noqa: E402
from app.modules.leaderboard.router import router as leaderboard_router  # noqa: E402
from app.modules.market.router import router as market_router  # noqa: E402
from app.modules.misc.router import admin_router as misc_admin_router  # noqa: E402
from app.modules.misc.router import user_router as misc_user_router  # noqa: E402
from app.modules.news.router import admin_router as news_admin_router  # noqa: E402
from app.modules.news.router import router as news_router  # noqa: E402
from app.modules.parent.router import router as parent_router  # noqa: E402
from app.modules.quests.router import router as quests_router  # noqa: E402
from app.modules.school_admin.router import router as school_admin_router  # noqa: E402
from app.modules.student.router import router as student_router  # noqa: E402
from app.modules.teacher.router import router as teacher_router  # noqa: E402
from app.modules.user_admin.router import router as user_admin_router  # noqa: E402

app.include_router(auth_router, prefix="/api", tags=["auth"])
app.include_router(internal_router, prefix="/internal", tags=["internal"])
app.include_router(common_router, prefix="/api", tags=["common"])
app.include_router(coursework_router, prefix="/api", tags=["coursework"])
app.include_router(school_admin_router, prefix="/api/admin", tags=["school_admin"])
app.include_router(user_admin_router, prefix="/api/admin", tags=["user-admin"])
app.include_router(journal_router, prefix="/api/journal", tags=["journal"])
app.include_router(student_router, prefix="/api/student", tags=["student"])
app.include_router(parent_router, prefix="/api/parent", tags=["parent"])
app.include_router(leaderboard_router, prefix="/api/leaderboard", tags=["leaderboard"])
app.include_router(market_router, prefix="/api/market", tags=["market"])
app.include_router(quests_router, prefix="/api/quests", tags=["quests"])
app.include_router(exchange_router, prefix="/api/exchange", tags=["exchange"])
app.include_router(news_router, prefix="/api/news", tags=["news"])
app.include_router(news_admin_router, prefix="/api/admin/news", tags=["news-admin"])
app.include_router(analytics_teacher_router, prefix="/api/teacher/analytics", tags=["analytics"])
app.include_router(analytics_admin_router, prefix="/api/admin", tags=["analytics-admin"])
app.include_router(appeals_router, prefix="/api/appeals", tags=["appeals"])
app.include_router(misc_admin_router, prefix="/api/admin", tags=["misc-admin"])
app.include_router(misc_user_router, prefix="/api/user", tags=["misc-user"])
app.include_router(teacher_router, prefix="/api/teacher", tags=["teacher"])


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
