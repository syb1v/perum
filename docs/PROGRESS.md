# PROGRESS — где мы сейчас и что делать дальше

> Этот файл — точка возобновления для новой сессии. Полный план — [PLAN.md](PLAN.md). Обновлять при каждом значимом продвижении.

**Дата последнего обновления:** 2026-05-24
**Текущая фаза:** **Phase 1 ЗАВЕРШЕНА** (control plane + provisioning + `platform_admin` auth). Дальше — Phase 2 (tenant auth + модели).
**Последний коммит:** feat platform_admin auth (см. `git log`).

---

## TL;DR для новой сессии

1. Прочитай [PLAN.md](PLAN.md) (полный план) и этот файл.
2. Подними локальный стенд (команды ниже) и убедись, что control plane отвечает.
3. Бери следующий незакрытый пункт из раздела «Следующие шаги».

---

## Что сделано ✅

### Phase 0 — Подготовка (готово полностью)
- Репозиторий `https://github.com/syb1v/perum.git`, ветка `main`.
- Структура monorepo: `perum-core`, `perum-tenant`, `perum-web`, `deploy`, `docs`.
- Документация: `ARCHITECTURE.md`, `TENANT_ISOLATION.md`, `PROVISIONING.md`, `DOMAINS.md`, `ROLES.md`, `DEPLOYMENT.md`, `MIGRATION_FROM_LEGACY.md`, `PLAN.md`, `PROGRESS.md`.
- `.gitignore`, `README.md`.

### Phase 1 — Control Plane + Provisioning (каркас + провижининг работают)
- `perum-core/requirements.txt` (FastAPI, SQLAlchemy 2.x async, asyncpg, alembic, pydantic[email], pyjwt, bcrypt, docker SDK).
- `perum-core/Dockerfile` (python:3.12-slim, healthcheck на /health).
- FastAPI бойлерплейт: `app/main.py`, `app/core/config.py` (pydantic-settings), `app/core/db.py` (async engine + Base + get_db).
- Модели `app/models.py`: `PlatformAdmin`, `Organization`, `OrganizationDomain`.
- Pydantic-схемы `app/schemas/organization.py` с валидацией slug (regex + reserved words) и deployment_mode.
- Alembic: `alembic.ini`, `migrations/env.py` (async), миграция `0001_init` (3 таблицы).
- Роутеры: `app/routers/health.py` (`/health`, `/health/db`), `app/routers/organizations.py` (list / create / get — **без provisioning, только запись в БД**).
- `deploy/docker-compose.core.yml`: `perum_core` + `perum_control_db` (Postgres 15) + `shared_redis` (Redis 7) + `caddy`. Сеть `perum_internal`.
- `deploy/caddy/Caddyfile` (dev): HTTP-only, `admin.perum.local → perum_core:3000`.
- `.env.example` с `IMAGE_REGISTRY` (для обхода блокировки Docker Hub).
- Тесты: `perum-core/tests/test_slug_validation.py` + `test_health.py` + `test_stack_spec.py` + `test_caddy_route.py`. **40 passed.**

### Phase 1 — Provisioning (готово, проверено end-to-end)
- **`app/core/docker_client.py`** — async-обёртка над docker-py (блокирующие вызовы через `asyncio.to_thread`): `ensure_network/ensure_image/create_volume/run_container/wait_for_healthy/exec/remove_containers/remove_stack`. Ресурсы помечаются лейблами `com.perum.org=<slug>` для очистки.
- **`app/services/stack_spec.py`** — единый источник правды по форме стека: `build_stack_spec()` (имена, образы, env, секреты) + `render_compose()` (человекочитаемый compose-манифест, с опц. редактированием секретов). Базовый образ postgres = `${IMAGE_REGISTRY}/library/postgres:15-alpine`.
- **`deploy/stack-templates/org-stack.docker-compose.yml.tmpl`** — reference-шаблон (зеркало `COMPOSE_TEMPLATE` в коде).
- **`app/services/caddy_admin.py`** — маршруты орг через Caddy admin API: вставка в позицию `0` сервера, слушающего `:80` (перед catch-all), `@id=perum-org-<slug>` для удаления.
- **`app/services/tenant_provisioner.py`** — `provision()` (шаги PROVISIONING.md 3,5,6,7,10,11 + cleanup при ошибке) и `deprovision()`. Синхронно, но вынесено в отдельную async-функцию (легко перенести в background).
- **`app/routers/organizations.py`** — `POST` создаёт запись и поднимает стек (идемпотентность: reuse `failed/archived`, 409 на `active/provisioning`); `POST /{slug}/reprovision`; `DELETE /{slug}?purge=`.
- **`app/main.py`** — на старте best-effort пере-синхронизирует Caddy-маршруты активных орг (самовосстановление после рестарта Caddy).
- **Модель `OrganizationSecret` + миграция `0002_org_secrets`** — db_password / secret_key / telemetry_token / redis_db_index (plaintext, TODO KMS — Phase 9).
- **`perum-tenant` каркас** — `app/{core,models,main}`, `/health` + `/health/db`, `TenantMeta` + миграция `tenant_0001_init`, Dockerfile (curl healthcheck). Образ `perum-tenant:dev` собирается локально.
- **`deploy/docker-compose.core.yml`** — `perum_core` получил docker-сокет + `IMAGE_REGISTRY`/`CONTROL_PLANE_URL`; дефолт `TENANT_IMAGE=perum-tenant:dev`.

### Phase 1 — platform_admin auth (готово, проверено)
- **`app/core/security.py`** — bcrypt (`hash_password`/`verify_password`) + JWT (`create/decode_access_token`, HS256, TTL 7 дней).
- **`app/core/deps.py`** — `require_platform_admin` (HTTPBearer, `auto_error=False`; декод JWT → проверка роли → загрузка `PlatformAdmin`; 401 на отсутствие/невалидность).
- **`app/routers/auth.py`** — `POST /api/auth/login`, `GET /api/auth/me`.
- **`app/schemas/auth.py`** — LoginRequest / TokenResponse / PlatformAdminRead.
- **`app/main.py`** — весь `/api/organizations` закрыт `require_platform_admin`; на старте сидится первый админ (`BOOTSTRAP_ADMIN_*`, dev `admin`/`admin`), если админов ещё нет.
- Тесты: `test_security.py` + `test_auth_protection.py`. **47 passed** суммарно.

### Проверено вживую (на dev-машине)
- `docker compose up` — все 4 сервиса healthy. Миграции `0001`+`0002` на старте.
- `/health` → `{"status":"ok"}`; `/health/db` → `{"status":"ok","db":1}`.
- **Provisioning end-to-end** (`IMAGE_REGISTRY=mirror.gcr.io`, образ `perum-tenant:dev`):
  - `POST /api/organizations {slug:acme}` → 201 `status=active` за ~13 c.
  - `docker ps` → `org_acme_app` + `org_acme_db` (оба healthy) + volume `org_acme_data`.
  - Caddy: маршрут `perum-org-acme` (`acme.perum.local → org_acme_app:3000`).
  - `curl --resolve acme.perum.local:80:127.0.0.1 http://acme.perum.local/health` → `200 {"org":"acme"}`; `/health/db` → `{"db":1}`.
  - В `org_acme_db` применилась миграция tenant (`tenant_meta`, `alembic_version=tenant_0001_init`).
  - Дубликат → 409; секреты и `organization_domains` записаны.
- **Auth + provisioning за гейтом:** login `admin/admin` → токен; `/api/organizations` без токена → 401, с токеном → 200; `/api/auth/me` → админ; неверный пароль → 401. Authed `POST {slug:demo}` → 201 active, стек поднялся, `demo.perum.local/health` → 200; authed `DELETE demo?purge` → всё снесено (0 контейнеров, маршрут Caddy 404).
- **Route sync на старте:** после пересоздания perum_core маршрут `acme.perum.local` восстановился автоматически.

---

## Чего ещё НЕТ ❌ (задел на следующие фазы)

- **Сидинг дефолтов (PROVISIONING шаг 8)** — `perum-tenant/app/scripts/seed_defaults.py` (WorkType, базовые Subject, BellSchedule, аватары). Phase 2.
- **Bootstrap org_admin (шаг 9)** — `POST /internal/bootstrap-org-admin` в tenant + инвайт на email. Phase 2.
- **`app/routers/domains.py`** — `/internal/validate-domain` для on-demand TLS. Phase 4.
- **CLI** `perum-core create-org` (опционально; сейчас провижининг идёт через POST API).
- **CI** `.github/workflows/test.yml` (pytest + tsc).
- **Известное ограничение (dev):** Caddy-маршруты живут в рантайм-конфиге; при рестарте Caddy теряются и восстанавливаются `_sync_caddy_routes()` на старте perum_core. Прод — на `Caddyfile.tmpl` (Phase 4).
- **Cleanup при ошибке провижининга сносит volume** (`down -v` по дизайну PROVISIONING.md); реальных данных пока нет — для Phase 1 ок.

---

## Следующие шаги (рекомендуемый порядок)

**Phase 1 закрыта.** Дальше:

1. **Phase 2 — tenant auth + модели.** В perum-tenant: модели Organization(meta)/School/User; `seed_defaults.py` (PROVISIONING шаг 8); `POST /internal/bootstrap-org-admin` (шаг 9, защита `TELEMETRY_TOKEN`); JWT с `org_slug` + middleware (валидация `payload.org_slug == settings.ORG_SLUG`). Достроить провижининг до шагов 8-9 (вызвать после миграций).
2. **E2E Phase 2:** создать орг → bootstrap org_admin → login на `acme.perum.local` → `/auth/me`; токен на чужую орг → 401.
3. **Phase 3 — perum-web (фронт).** Login, AuthContext, API-клиент, middleware platform-vs-tenant; platform UI (список + создание орг), dashboard-заглушки ролей. **Первый кликабельный фронт.** Можно поднять раньше как тонкую admin-панель поверх готового control plane API.

Уже тестируется руками: **Swagger UI `http://admin.perum.local/docs`** — login → Authorize токеном → create/list/delete орг с реальным подъёмом стеков.

---

## Как поднять локальный стенд

```bash
cd "/home/sybiv/Рабочий стол/perum-v2"

# admin.perum.local в /etc/hosts (один раз, нужен sudo):
echo "127.0.0.1 admin.perum.local" | sudo tee -a /etc/hosts

# поднять (mirror.gcr.io обходит блокировку Docker Hub в РФ):
IMAGE_REGISTRY=mirror.gcr.io docker compose -f deploy/docker-compose.core.yml up -d --build

# проверить:
docker compose -f deploy/docker-compose.core.yml ps
curl http://admin.perum.local/health        # {"status":"ok"}
curl http://admin.perum.local/health/db     # {"status":"ok","db":1}
curl http://admin.perum.local/docs          # Swagger
```

Остановить: `docker compose -f deploy/docker-compose.core.yml down` (с `-v` — снести и БД).

Прогнать тесты control plane (без Docker):
```bash
cd perum-core
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt pytest
.venv/bin/python -m pytest      # ожидается: passed
```

---

## Рабочие правила

- **CHANGELOG.md** — при каждом заметном изменении добавлять запись и поднимать версию (`0.0.x`). На русском, человеческим языком, свежее сверху. Текущая версия: `0.0.9`.
- Коммитим осмысленными порциями; пуш в `main` — по ходу работы.

## Зафиксированные решения (не пересматривать без запроса)

- **Изоляция: silo per org** (1 орг = 1 docker-стек). Пользователь выбрал сознательно вместо schema-per-org.
- **DNS: Cloudflare** (wildcard `*.perum.ru` + custom domains). **Регистратор: Beget** (API нет).
- **Прод: generic Ubuntu + SSH**, управление через Docker. Cloud-провайдер неважен.
- **Обновления: только по кнопке орг (opt-in).** Control plane публикует релиз (версия + changelog), орг видит уведомление в админке и обновляется одной кнопкой когда захочет. Принудительных/авто-обновлений НЕТ, даже для секьюрити-патчей. Апдейт volume-preserving (БД/настройки/данные не трогаются), орг независимы. Multi-host (`dedicated_vm`) — через агент-контейнер на VM (модель Remnawave panel↔node), не SSH. Решение пользователя 2026-05-24. Детали — [PLAN.md](PLAN.md) §6 + [DEPLOYMENT.md](DEPLOYMENT.md).
- **Биллинг: заглушки** на всех фазах, без платёжных систем.
- **Docker Hub в РФ блокируется** → `IMAGE_REGISTRY=mirror.gcr.io` или daemon.json mirror.
- **Старый PERUM** (`пэрум.рф`, `/home/sybiv/Рабочий стол/PERUM`) — read-only, не трогать, миграция через ~6 мес опционально.

---

## История коммитов

```
50ac870 fix(deploy): parametrize base-image registry via IMAGE_REGISTRY
aaeb6e2 fix(deploy): pin perum_core to local build; document RU registry mirror
0cedc0b test(perum-core): add slug + health tests; fix slug length off-by-one
8e5ace5 feat(perum-core): Phase 1 starter — FastAPI skeleton + Postgres + Caddy
3fbf701 chore: bootstrap Phase 0 — monorepo skeleton + architecture docs
```
