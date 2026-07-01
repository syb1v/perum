"""Агент организации (ROLE=org_agent): enroll-on-boot + управление школами на ноде.

При старте узел орг предъявляет свой ENROLLMENT_TOKEN ядру (`POST /api/enroll`),
получает org_slug + текущий релиз и сохраняет локально (`agent_state`). Идемпотентно:
если уже подключён — ничего не делает. Ошибки не валят старт (повтор на следующем
старте).
"""

from __future__ import annotations

import logging
import time
from datetime import datetime, timezone

import httpx
import psutil
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.schemas import (
    AgentDeprovisionSchoolRequest,
    AgentHealthResponse,
    AgentHeartbeatRequest,
    AgentHeartbeatResponse,
    AgentProvisionSchoolRequest,
    AgentProvisionSchoolResponse,
    AgentSchoolActionResponse,
    AgentSchoolInfo,
    AgentSchoolListResponse,
    AgentUpdateSchoolRequest,
    AgentUpdateSchoolResponse,
)
from app.core.config import get_settings
from app.core.db import SessionLocal
from app.core.docker_client import DockerClient
from app.models import AgentState
from app.services.school_provisioner import (
    deprovision_school,
    provision_school,
    suspend_school,
    unsuspend_school,
    update_school,
)

logger = logging.getLogger("perum.agent")


async def get_agent_state(db: AsyncSession) -> AgentState | None:
    return await db.scalar(select(AgentState).limit(1))


async def enroll_on_boot() -> None:
    settings = get_settings()
    if settings.ROLE != "org_agent":
        return
    try:
        async with SessionLocal() as db:
            existing = await get_agent_state(db)
            if existing is not None:
                logger.info("agent: уже подключён к орг '%s'", existing.org_slug)
                await _resync_node_caddy_routes()
                return
            if not settings.ENROLLMENT_TOKEN:
                logger.warning("agent: ENROLLMENT_TOKEN не задан — пропускаю enroll")
                return

            # Снять реальные характеристики сервера и сообщить их ядру — оператор не
            # вводит CPU/RAM/диск вручную, нода сама себя «представляет» при подключении.
            try:
                cpu_cores = psutil.cpu_count(logical=True) or psutil.cpu_count() or 1
                ram_gb = round(psutil.virtual_memory().total / (1024 ** 3), 1)
                disk_gb = round(psutil.disk_usage("/").total / (1024 ** 3), 1)
            except Exception:  # psutil может не дать данные в нестандартном окружении
                cpu_cores = ram_gb = disk_gb = None

            url = f"{settings.CORE_URL.rstrip('/')}/api/enroll"
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(url, json={
                    "token": settings.ENROLLMENT_TOKEN,
                    "cpu_cores": cpu_cores,
                    "ram_gb": ram_gb,
                    "disk_gb": disk_gb,
                    "agent_version": "1.0.0",
                })
            if resp.status_code >= 300:
                logger.error("agent: enroll не удался: %s %s", resp.status_code, resp.text[:300])
                return
            data = resp.json()
            rel = (data.get("current_release") or {})
            db.add(AgentState(
                id=1,
                org_slug=data["org_slug"],
                org_name=data.get("org_name"),
                core_url=settings.CORE_URL,
                release_tag=rel.get("image") or rel.get("version_tag"),
            ))
            await db.commit()
            logger.info("agent: подключён к орг '%s' (релиз %s)", data["org_slug"], rel.get("version_tag"))
            await _resync_node_caddy_routes()
    except Exception as exc:
        logger.warning("agent: enroll-on-boot отложен: %s", exc)


async def get_agent_health(db: AsyncSession) -> AgentHealthResponse:
    state = await get_agent_state(db)
    docker = DockerClient()
    containers = await docker.list_containers(all=True)
    school_containers = [c for c in containers if c.get("Labels", {}).get("com.perum.type") == "school"]
    schools_count = len(set(c.get("Labels", {}).get("com.perum.school") for c in school_containers if c.get("Labels", {}).get("com.perum.school")))

    cpu_percent = psutil.cpu_percent(interval=0.1)
    mem = psutil.virtual_memory()
    disk = psutil.disk_usage("/")

    return AgentHealthResponse(
        node_name=state.org_slug if state else None,
        status="active" if state else "pending",
        schools_count=schools_count,
        cpu_percent=cpu_percent,
        ram_used_mb=mem.used // (1024 * 1024),
        ram_total_mb=mem.total // (1024 * 1024),
        disk_used_gb=round(disk.used / (1024 ** 3), 2),
        disk_total_gb=round(disk.total / (1024 ** 3), 2),
        uptime_seconds=int(time.time() - psutil.boot_time()),
        agent_version="1.0.0",
        timestamp=datetime.now(timezone.utc),
    )


async def restart_node_stack(db: AsyncSession) -> "AgentNodeActionResponse":
    """Полная перезагрузка стека ноды: рестарт ВСЕХ контейнеров стека (школы, БД ноды,
    redis, caddy, docker_proxy) И самого воркора. Сервер не перезагружается. Воркор
    перезапускает себя в фоне ПОСЛЕ отправки ответа — связь ядро→воркор на время
    рестарта пропадёт и вернётся (ожидаемо: монитор покажет offline→active)."""
    import asyncio

    from app.agent.schemas import AgentNodeActionResponse

    docker = DockerClient()
    try:
        restarted, self_name = await docker.restart_node_stack_except_self()
        if self_name:
            # Отдельная задача: подождать, чтобы HTTP-ответ ушёл, и перезапустить воркор.
            async def _self_restart() -> None:
                await asyncio.sleep(1.5)
                await docker.restart_self(self_name)
            asyncio.create_task(_self_restart())
            restarted.append(f"container:{self_name} (воркор, в фоне)")
        return AgentNodeActionResponse(
            success=True, restarted=restarted,
            message=f"перезагрузка стека ноды: {len(restarted)} контейнер(ов), воркор перезапускается",
        )
    except Exception as exc:  # noqa: BLE001
        return AgentNodeActionResponse(success=False, message=f"ошибка перезагрузки: {exc}")


async def get_agent_schools(db: AsyncSession) -> AgentSchoolListResponse:
    docker = DockerClient()
    containers = await docker.list_containers(all=True)

    schools_map: dict[str, AgentSchoolInfo] = {}
    for c in containers:
        labels = c.get("Labels", {})
        if labels.get("com.perum.type") != "school":
            continue
        slug = labels.get("com.perum.school")
        if not slug:
            continue
        if slug not in schools_map:
            schools_map[slug] = AgentSchoolInfo(
                slug=slug,
                status="unknown",
                release_tag=labels.get("com.perum.release"),
                containers=[],
            )
        schools_map[slug].containers.append(c.get("Names", ["unknown"])[0].lstrip("/"))
        state = c.get("State", "unknown")
        if state == "running":
            schools_map[slug].status = "active"
        elif state == "exited":
            schools_map[slug].status = "stopped"

    return AgentSchoolListResponse(schools=list(schools_map.values()), total=len(schools_map))


async def _ensure_local_org(db: AsyncSession, state: AgentState) -> int:
    """На ноде нужна строка организации (School.org_id NOT NULL). Заводим/находим
    её по slug из enroll. Ядро остаётся источником истины — это лишь локальная
    привязка для стека на ноде."""
    from sqlalchemy import select as _select
    from app.models import Organization
    org = await db.scalar(_select(Organization).where(Organization.slug == state.org_slug))
    if org is None:
        org = Organization(slug=state.org_slug, name=state.org_name or state.org_slug, status="active")
        db.add(org)
        await db.commit()
        await db.refresh(org)
    return org.id


async def provision_school_on_node(
    db: AsyncSession, req: AgentProvisionSchoolRequest
) -> AgentProvisionSchoolResponse:
    try:
        state = await get_agent_state(db)
        if not state:
            return AgentProvisionSchoolResponse(
                success=False, school_slug=req.school_slug, message="Agent not enrolled"
            )

        from sqlalchemy import select as _select
        from app.models import School, SchoolSecret

        org_id = await _ensure_local_org(db, state)
        school = await db.scalar(_select(School).where(School.slug == req.school_slug))
        if school is None:
            school = School(org_id=org_id, slug=req.school_slug, name=req.school_name, status="provisioning")
            db.add(school)
            await db.commit()
            await db.refresh(school)

        # Секреты школы генерирует ЯДРО и передаёт сюда — чтобы db_password/токены на
        # ноде совпадали с записью ядра (бэкапы, управление). Кладём их в локальную БД.
        secret = await db.get(SchoolSecret, school.id)
        if secret is None:
            db.add(SchoolSecret(
                school_id=school.id,
                db_password=req.db_password,
                secret_key=req.secret_key,
                telemetry_token=req.telemetry_token,
                internal_rpc_token=req.internal_rpc_token,
                redis_db_index=req.redis_db_index,
            ))
            await db.commit()

        # Образ + полный домен школы передаёт ядро (на ноде нет таблицы релизов/орг-домена).
        await provision_school(school, db, image=req.release_tag, host=req.host)
        return AgentProvisionSchoolResponse(
            success=True, school_slug=req.school_slug, message="School provisioned successfully"
        )
    except Exception as exc:
        logger.error("provision_school_on_node failed: %s", exc)
        return AgentProvisionSchoolResponse(
            success=False, school_slug=req.school_slug, message=str(exc)
        )


async def update_school_on_node(
    db: AsyncSession, req: AgentUpdateSchoolRequest
) -> AgentUpdateSchoolResponse:
    try:
        from sqlalchemy import select
        from app.models import School
        school = await db.scalar(select(School).where(School.slug == req.school_slug))
        if not school:
            return AgentUpdateSchoolResponse(
                success=False, school_slug=req.school_slug, message="School not found"
            )
        outcome = await update_school(school, db, to_image=req.image)
        return AgentUpdateSchoolResponse(
            success=True,
            school_slug=req.school_slug,
            rolled_back=outcome.rolled_back if hasattr(outcome, 'rolled_back') else False,
            message="School updated successfully",
        )
    except Exception as exc:
        logger.error("update_school_on_node failed: %s", exc)
        return AgentUpdateSchoolResponse(
            success=False, school_slug=req.school_slug, message=str(exc)
        )


async def suspend_school_on_node(
    db: AsyncSession, school_slug: str
) -> AgentSchoolActionResponse:
    try:
        from sqlalchemy import select
        from app.models import School
        school = await db.scalar(select(School).where(School.slug == school_slug))
        if not school:
            return AgentSchoolActionResponse(
                success=False, school_slug=school_slug, message="School not found"
            )
        await suspend_school(school, db)
        return AgentSchoolActionResponse(
            success=True, school_slug=school_slug, message="School suspended"
        )
    except Exception as exc:
        logger.error("suspend_school_on_node failed: %s", exc)
        return AgentSchoolActionResponse(
            success=False, school_slug=school_slug, message=str(exc)
        )


async def unsuspend_school_on_node(
    db: AsyncSession, school_slug: str
) -> AgentSchoolActionResponse:
    try:
        from sqlalchemy import select
        from app.models import School
        school = await db.scalar(select(School).where(School.slug == school_slug))
        if not school:
            return AgentSchoolActionResponse(
                success=False, school_slug=school_slug, message="School not found"
            )
        await unsuspend_school(school, db)
        return AgentSchoolActionResponse(
            success=True, school_slug=school_slug, message="School unsuspended"
        )
    except Exception as exc:
        logger.error("unsuspend_school_on_node failed: %s", exc)
        return AgentSchoolActionResponse(
            success=False, school_slug=school_slug, message=str(exc)
        )


async def deprovision_school_on_node(
    db: AsyncSession, req: AgentDeprovisionSchoolRequest
) -> AgentSchoolActionResponse:
    try:
        from sqlalchemy import select
        from app.models import School
        school = await db.scalar(select(School).where(School.slug == req.school_slug))
        if not school:
            return AgentSchoolActionResponse(
                success=False, school_slug=req.school_slug, message="School not found"
            )
        await deprovision_school(school, db, purge=(req.mode == "purge"))
        return AgentSchoolActionResponse(
            success=True, school_slug=req.school_slug, message=f"School {req.mode}d"
        )
    except Exception as exc:
        logger.error("deprovision_school_on_node failed: %s", exc)
        return AgentSchoolActionResponse(
            success=False, school_slug=req.school_slug, message=str(exc)
        )


def _landing_html(org_name: str, domain: str, school_hosts: list[str]) -> str:
    schools = "".join(f'<li><a href="https://{h}">{h}</a></li>' for h in school_hosts) or "<li>школы появятся здесь</li>"
    return f"""<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{org_name}</title>
<style>body{{font-family:system-ui,sans-serif;background:#0b1020;color:#e6e9f0;margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center}}
.card{{max-width:640px;padding:40px;text-align:center}}h1{{font-size:2rem;margin:0 0 8px}}
.dom{{color:#5ea0ff;font-family:monospace}}ul{{list-style:none;padding:0;margin:24px 0 0;text-align:left;display:inline-block}}
li{{margin:6px 0}}a{{color:#7cc4ff}}.muted{{color:#8a93a8;font-size:.9rem;margin-top:24px}}</style></head>
<body><div class="card"><h1>{org_name}</h1><div class="dom">{domain}</div>
<p>Образовательная платформа организации. Школы:</p><ul>{schools}</ul>
<div class="muted">Powered by ПЭРУМ</div></div></body></html>"""


async def provision_landing_on_node(db: AsyncSession, req) -> "AgentLandingResponse":
    """Поднять/обновить контейнер-лендинг орг на ноде и маршрут Caddy (корневой домен)."""
    from app.agent.schemas import AgentLandingResponse
    from app.services.stack_spec import landing_container_name, landing_label_slug
    from app.services.caddy_admin import get_caddy_admin

    settings = get_settings()
    docker = DockerClient()
    caddy = get_caddy_admin()
    slug = req.org_slug
    name = landing_container_name(slug)
    label = landing_label_slug(slug)
    image = "nginx:alpine"
    try:
        await docker.ensure_network(settings.DOCKER_NETWORK)
        await docker.ensure_image(image)
        await docker.remove_containers(label)
        await docker.run_container(
            name=name, image=image, slug=label, role="landing",
            environment={}, network=settings.DOCKER_NETWORK,
        )
        import base64 as _b64
        html_b64 = _b64.b64encode(_landing_html(req.org_name, req.domain, req.school_hosts).encode()).decode()
        code, out = await docker.exec(name, ["sh", "-c", f"echo {html_b64} | base64 -d > /usr/share/nginx/html/index.html"])
        if code != 0:
            return AgentLandingResponse(success=False, domain=req.domain, message=f"write index failed: {out[-300:]}")
        await caddy.add_proxy_route(label, req.domain, f"{name}:80")
        # Сохраняем домен орг в локальном shadow-record — нужен для Caddy re-sync
        # при рестарте ноды (иначе после docker restart caddy маршрут лендинга теряется).
        from sqlalchemy import select as _sel
        from app.models import Organization as _Org
        local_org = await db.scalar(_sel(_Org).where(_Org.slug == slug))
        if local_org and not local_org.domain:
            local_org.domain = req.domain
            await db.commit()
        return AgentLandingResponse(success=True, domain=req.domain, message="landing provisioned")
    except Exception as exc:  # noqa: BLE001
        logger.error("provision_landing_on_node failed: %s", exc)
        return AgentLandingResponse(success=False, domain=req.domain, message=str(exc))


async def _resync_node_caddy_routes() -> None:
    """Восстановить все Caddy-маршруты ноды после рестарта Caddy-контейнера.

    Node Caddy хранит runtime-конфиг в памяти — после рестарта Caddy все маршруты,
    добавленные через admin API, исчезают. Эта функция воссоздаёт их из локальной БД:
    лендинг орг, активные школы и maintenance-маршруты замороженных школ.
    Ошибки не фатальны — школы/лендинг просто временно недоступны до следующего
    ручного провижинига или рестарта воркора.
    """
    from sqlalchemy import select as _sel
    from app.core.db import SessionLocal
    from app.models import AgentState as _AS, Organization as _Org, School as _Sch, SchoolDomain as _SD
    from app.services.caddy_admin import get_caddy_admin
    from app.services.stack_spec import (
        landing_container_name, landing_label_slug,
        school_container_name, school_label_slug,
    )

    caddy = get_caddy_admin()
    try:
        async with SessionLocal() as db:
            state = await db.scalar(_sel(_AS).limit(1))
            if not state:
                return

            local_org = await db.scalar(_sel(_Org).where(_Org.slug == state.org_slug))
            if local_org and local_org.domain:
                lbl = landing_label_slug(state.org_slug)
                try:
                    await caddy.add_proxy_route(lbl, local_org.domain, f"{landing_container_name(state.org_slug)}:80")
                    logger.info("node caddy sync: landing %s", local_org.domain)
                except Exception as exc:  # noqa: BLE001
                    logger.warning("node caddy sync: landing failed: %s", exc)

            active = (await db.execute(
                _sel(_SD, _Sch).join(_Sch, _SD.school_id == _Sch.id)
                .where(_Sch.status == "active", _SD.status == "active")
            )).all()
            for domain, school in active:
                try:
                    await caddy.add_proxy_route(
                        school_label_slug(school.slug), domain.domain,
                        f"{school_container_name(school.slug, 'app')}:3000",
                    )
                    logger.info("node caddy sync: school %s", domain.domain)
                except Exception as exc:  # noqa: BLE001
                    logger.warning("node caddy sync: school %s failed: %s", domain.domain, exc)

            suspended = (await db.execute(
                _sel(_SD, _Sch).join(_Sch, _SD.school_id == _Sch.id)
                .where(_Sch.status == "suspended", _SD.status == "active")
            )).all()
            for domain, school in suspended:
                try:
                    await caddy.add_maintenance_route(school_label_slug(school.slug), domain.domain)
                    logger.info("node caddy sync: suspended school %s -> 503", domain.domain)
                except Exception as exc:  # noqa: BLE001
                    logger.warning("node caddy sync: suspended school %s failed: %s", domain.domain, exc)
    except Exception as exc:  # noqa: BLE001
        logger.warning("node caddy route sync skipped: %s", exc)


async def deprovision_landing_on_node(db: AsyncSession, org_slug: str, domain: str | None = None) -> "AgentLandingResponse":
    from app.agent.schemas import AgentLandingResponse
    from app.services.stack_spec import landing_label_slug
    from app.services.caddy_admin import get_caddy_admin

    docker = DockerClient()
    caddy = get_caddy_admin()
    label = landing_label_slug(org_slug)
    try:
        await docker.remove_containers(label)
        await caddy.remove_route(label)
        return AgentLandingResponse(success=True, domain=domain or "", message="landing removed")
    except Exception as exc:  # noqa: BLE001
        return AgentLandingResponse(success=False, domain=domain or "", message=str(exc))


async def internal_rpc_on_node(db: AsyncSession, school_slug: str, req) -> "AgentInternalRpcResponse":
    """Проксировать вызов во внутренний RPC стека школы на ноде. Воркер берёт секреты
    школы из локальной БД и ходит в http://school_<slug>_app:3000/internal{path}."""
    from app.agent.schemas import AgentInternalRpcResponse
    from sqlalchemy import select as _select
    from app.models import School, SchoolSecret
    from app.services.stack_spec import school_container_name

    school = await db.scalar(_select(School).where(School.slug == school_slug))
    if not school:
        return AgentInternalRpcResponse(status_code=404, data={"detail": "school not found on node"})
    secret = await db.get(SchoolSecret, school.id)
    if not secret:
        return AgentInternalRpcResponse(status_code=409, data={"detail": "school secret missing on node"})

    url = f"http://{school_container_name(school_slug, 'app')}:3000/internal{req.path}"
    headers = {"X-Telemetry-Token": secret.telemetry_token}
    if getattr(secret, "internal_rpc_token", None):
        headers["X-Internal-Token"] = secret.internal_rpc_token
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.request(req.method, url, headers=headers, json=req.body)
    except Exception as exc:  # noqa: BLE001
        return AgentInternalRpcResponse(status_code=502, data={"detail": f"school unreachable on node: {exc}"})
    try:
        data = resp.json() if resp.content else {}
    except Exception:  # noqa: BLE001
        data = {"detail": resp.text[:300]}
    return AgentInternalRpcResponse(status_code=resp.status_code, data=data)


async def send_heartbeat(
    db: AsyncSession, req: AgentHeartbeatRequest
) -> AgentHeartbeatResponse:
    try:
        state = await get_agent_state(db)
        if not state:
            return AgentHeartbeatResponse(success=False, node_id=None)

        settings = get_settings()
        url = f"{settings.CORE_URL.rstrip('/')}/internal/heartbeat"
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                url,
                json={
                    "org_slug": state.org_slug,
                    "node_name": req.node_name,
                    "schools_count": req.schools_count,
                    "cpu_percent": req.cpu_percent,
                    "ram_used_mb": req.ram_used_mb,
                    "ram_total_mb": req.ram_total_mb,
                    "disk_used_gb": req.disk_used_gb,
                    "disk_total_gb": req.disk_total_gb,
                    "agent_version": req.agent_version,
                },
            )
        if resp.status_code >= 300:
            logger.warning("heartbeat failed: %s", resp.status_code)
            return AgentHeartbeatResponse(success=False, node_id=None)

        data = resp.json()
        return AgentHeartbeatResponse(success=True, node_id=data.get("node_id"))
    except Exception as exc:
        logger.warning("send_heartbeat failed: %s", exc)
        return AgentHeartbeatResponse(success=False, node_id=None)
