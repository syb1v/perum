import asyncio
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
    from app.models import Node, NodeAssignment, Organization, OrganizationDomain, School, SchoolDomain
    from app.services.caddy_admin import get_caddy_admin
    from app.services.stack_spec import school_container_name, school_label_slug

    caddy = get_caddy_admin()
    try:
        async with SessionLocal() as db:
            # Орг на нодах (node_id IS NOT NULL) не имеют локальных контейнеров
            # на ядре — их лендинги живут на нодах. Пропускаем их при синке.
            org_rows = (await db.execute(
                select(OrganizationDomain, Organization)
                .join(Organization, OrganizationDomain.org_id == Organization.id)
                .where(
                    Organization.status == "active",
                    OrganizationDomain.status == "active",
                    Organization.node_id.is_(None),
                )
            )).all()
            # v2: маршруты ШКОЛ (silo=школа) — раньше не восстанавливались после
            # рестарта/reload Caddy, и школа теряла маршрутизацию (AUDIT раздел 4).
            school_rows = (await db.execute(
                select(SchoolDomain, School)
                .join(School, SchoolDomain.school_id == School.id)
                .where(School.status == "active", SchoolDomain.status == "active")
            )).all()
            # Замороженные школы: восстановить maintenance-маршрут (503), иначе после
            # рестарта Caddy хост замороженной школы проваливался в catch-all
            # вместо «приостановлено» (AUDIT, lifecycle #11).
            suspended_rows = (await db.execute(
                select(SchoolDomain, School)
                .join(School, SchoolDomain.school_id == School.id)
                .where(School.status == "suspended", SchoolDomain.status == "active")
            )).all()
            # Школы на нодах: маршрут должен идти на нода:80, а не на локальный
            # контейнер. Без этого после рестарта ядра route перетирался на
            # несуществующий локальный апстрим → 502 для школ на нодах.
            node_map = {
                sid: host
                for sid, host in (await db.execute(
                    select(NodeAssignment.school_id, Node.hostname)
                    .join(Node, Node.id == NodeAssignment.node_id)
                )).all()
            }
    except Exception as exc:  # noqa: BLE001
        logger.warning("caddy route sync skipped (DB not ready?): %s", exc)
        return

    for domain, org in org_rows:
        try:
            await caddy.add_proxy_route(org.slug, domain.domain, f"org_{org.slug}_app:3000")
            logger.info("route sync (org): %s -> org_%s_app:3000", domain.domain, org.slug)
        except Exception as exc:  # noqa: BLE001
            logger.warning("route sync failed for %s: %s", domain.domain, exc)

    for domain, school in school_rows:
        try:
            rid = school_label_slug(school.slug) if domain.domain_type == "subdomain" else f"dom-{domain.id}"
            if school.id in node_map:
                # Школа на ноде: DNS школы указывает на ноду напрямую, платформенный
                # Caddy не задействован для основного трафика. Маршрут здесь нужен
                # только если кастомный домен школы указывает на ядро (редко).
                # Используем add_proxy_route — нода сама обслуживает весь трафик.
                upstream = f"{node_map[school.id]}:80"
                await caddy.add_proxy_route(rid, domain.domain, upstream)
            else:
                # Локальная школа на ядре: tenant-образ обслуживает и API и фронтенд.
                upstream = f"{school_container_name(school.slug, 'app')}:3000"
                await caddy.add_proxy_route(rid, domain.domain, upstream)
            logger.info("route sync (school): %s -> %s", domain.domain, upstream)
        except Exception as exc:  # noqa: BLE001
            logger.warning("route sync failed for school %s: %s", domain.domain, exc)

    for domain, school in suspended_rows:
        try:
            rid = school_label_slug(school.slug) if domain.domain_type == "subdomain" else f"dom-{domain.id}"
            await caddy.add_maintenance_route(rid, domain.domain)
            logger.info("route sync (suspended school): %s -> 503", domain.domain)
        except Exception as exc:  # noqa: BLE001
            logger.warning("maintenance route sync failed for school %s: %s", domain.domain, exc)


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


async def _billing_enforcement_loop() -> None:
    """Фоновый свип просроченных подписок (#4): раз в BILLING_ENFORCE_INTERVAL_S
    замораживает delinquent-орг и фиксирует дебиторку. Сбой итерации не валит
    петлю. Раньше enforce был только ручным — просроченные орг работали бессрочно."""
    from app.core.db import SessionLocal
    from app.services.billing import run_billing_enforcement

    interval = settings.BILLING_ENFORCE_INTERVAL_S
    await asyncio.sleep(min(interval, 30))  # дать БД прогреться, не бить сразу на старте
    while True:
        try:
            async with SessionLocal() as db:
                result = await run_billing_enforcement(db)
            if result.get("suspended"):
                logger.info("billing scheduler: suspended %s", result["suspended"])
        except Exception as exc:  # noqa: BLE001
            logger.warning("billing scheduler iteration failed: %s", exc)
        await asyncio.sleep(interval)


async def _node_monitor_loop() -> None:
    """Мониторинг связи и ЗАГРУЗКИ нод: статус + реальные метрики ставит ядро само.
    Раз в NODE_MONITOR_INTERVAL_S по каждой ноде (active/offline/draining): меряем
    латентность ядро→воркер (whoami) и тянем /health воркера (cpu/ram/disk через
    psutil). Доступна → active + свежий last_heartbeat + снимок метрик + ping_ms;
    недоступна → offline. Lifecycle (pending_bootstrap, decommissioned) и drain не трогаем."""
    from sqlalchemy import select

    from app.core.db import SessionLocal
    from app.models import Node
    from app.services.node_monitor import MONITORABLE, refresh_node_metrics
    from app.services.remote_node_client import RemoteNodeClient

    interval = settings.NODE_MONITOR_INTERVAL_S
    client = RemoteNodeClient(timeout=8.0)
    await asyncio.sleep(min(interval, 20))

    async def _one(node_id: int) -> None:
        # Своя сессия на ноду: параллельные коммиты не конфликтуют, медленная нода
        # не тормозит остальные.
        async with SessionLocal() as ndb:
            n = await ndb.get(Node, node_id)
            if n is not None:
                await refresh_node_metrics(n, ndb, client)

    while True:
        try:
            async with SessionLocal() as db:
                node_ids = (
                    await db.execute(select(Node.id).where(Node.status.in_(MONITORABLE)))
                ).scalars().all()
            await asyncio.gather(*(_one(nid) for nid in node_ids), return_exceptions=True)
        except Exception as exc:  # noqa: BLE001
            logger.warning("node monitor iteration failed: %s", exc)
        await asyncio.sleep(interval)


@asynccontextmanager
async def lifespan(app: FastAPI):
    tasks: list[asyncio.Task] = []
    if settings.ROLE == "org_agent":
        # Узел орг: подключиться к ядру по enrollment-токену (платформенные сидинг
        # и Caddy-синк тут не нужны).
        from app.agent.service import enroll_on_boot

        await enroll_on_boot()
    else:
        await _seed_bootstrap_admin()
        await _sync_caddy_routes()
        if settings.BILLING_ENFORCE_INTERVAL_S > 0:
            tasks.append(asyncio.create_task(_billing_enforcement_loop()))
        if settings.NODE_MONITOR_INTERVAL_S > 0:
            tasks.append(asyncio.create_task(_node_monitor_loop()))
    try:
        yield
    finally:
        for t in tasks:
            t.cancel()
        # Дать задачам корректно свернуться (подавляем CancelledError).
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)


app = FastAPI(
    title="PERUM Control Plane",
    version="0.5.3",
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

from app.agent.router import router as agent_router  # noqa: E402
from app.core.deps import require_org_admin, require_platform_admin  # noqa: E402
from app.routers import auth, billing, contact, enroll, health, internal_domains, metrics, news, nodes, notifications, org_self, organizations, ota_config, releases, releases_ci, schools, stats, support, telemetry  # noqa: E402

app.include_router(health.router)
# Prometheus-метрики на /metrics (скрейп напрямую по внутренней сети).
app.include_router(metrics.router)
# On-demand TLS gate для Caddy (/internal/validate-domain) — по внутренней сети.
app.include_router(internal_domains.router, prefix="/internal", tags=["internal"])
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
# Лиды лендинга: POST публичный (форма «Связаться»), GET/PATCH — platform_admin.
app.include_router(contact.router, prefix="/api/contact", tags=["contact"])
# Приём телеметрии от школьных стеков — публичный путь, auth по telemetry-token.
app.include_router(telemetry.router, prefix="/api/telemetry", tags=["telemetry"])
# Сводная статистика платформы — только platform_admin.
app.include_router(
    stats.router, prefix="/api/platform", tags=["stats"],
    dependencies=[Depends(require_platform_admin)],
)
# Биллинг-операции платформы (sweep просроченных) — только platform_admin.
app.include_router(
    billing.router, prefix="/api/billing", tags=["billing"],
    dependencies=[Depends(require_platform_admin)],
)
# Подключение узла орг — публичный handshake (токен сам аутентифицирует).
app.include_router(enroll.router, prefix="/api/enroll", tags=["enroll"])
# Статус узла орг (whoami) — работает в обоих режимах.
app.include_router(agent_router, prefix="/api/agent", tags=["agent"])
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
# CI-публикация релизов — отдельный bearer-токен (RELEASE_PUBLISH_TOKEN), НЕ
# platform_admin. GitHub Actions регистрирует релиз тенанта при реальном изменении кода.
app.include_router(releases_ci.router, prefix="/api/ci", tags=["ci"])
# Источник OTA-обновлений (реестр/репо/токен) — настраивает platform_admin.
app.include_router(
    ota_config.router,
    prefix="/api/platform/ota-config",
    tags=["ota-config"],
    dependencies=[Depends(require_platform_admin)],
)
# Школы — управляет org_admin (узел орг), скоуп по org_id из токена.
app.include_router(
    schools.router,
    prefix="/api/schools",
    tags=["schools"],
    dependencies=[Depends(require_org_admin)],
)
# Self-service орг: read-only биллинг, доступный даже при заморозке за неоплату
# (управление школами заблокировано require_org_admin, биллинг — нет). Гард — на
# уровне эндпоинта (require_org_admin_billing).
app.include_router(org_self.router, prefix="/api/org", tags=["org"])
# Node management: platform_admin CRUD + capacity planning.
app.include_router(nodes.platform_router, prefix="/api", tags=["nodes"])
app.include_router(nodes.capacity_router, prefix="/api", tags=["capacity"])
# Org admin: view own nodes.
app.include_router(nodes.org_nodes_router, prefix="/api", tags=["org-nodes"])
# Новости ядра: POST/GET/PATCH/DELETE — platform_admin; GET /feed — org_admin.
# Гарды на самих эндпоинтах (смешанные роли в одном роутере).
app.include_router(news.router, prefix="/api/news", tags=["news"])
# Уведомления организатора (колокол) — только org_admin (гард на роутере).
app.include_router(notifications.router, prefix="/api/notifications", tags=["notifications"])
# Поддержка (тикеты): /tickets* — org_admin, /admin/* — platform_admin (гарды на эндпоинтах).
app.include_router(support.router, prefix="/api/support", tags=["support"])


@app.get("/")
async def root() -> dict:
    return {
        "service": settings.APP_NAME,
        "environment": settings.ENVIRONMENT,
        "docs": "/docs",
    }
