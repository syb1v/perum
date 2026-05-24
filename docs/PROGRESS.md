# PROGRESS — где мы сейчас и что делать дальше

> Этот файл — точка возобновления для новой сессии. Полный план — [PLAN.md](PLAN.md). Обновлять при каждом значимом продвижении.

**Дата последнего обновления:** 2026-05-24
**Текущая фаза:** Phase 1 (Control Plane + Provisioning) — в работе.
**Последний коммит:** `50ac870`.

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

### Phase 1 — Control Plane (частично, каркас работает)
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
- Тесты: `perum-core/tests/test_slug_validation.py` (28 кейсов) + `test_health.py` (TestClient). **34 passed.**

### Проверено вживую (на dev-машине)
- `docker compose up` — все 4 сервиса healthy.
- Миграция `0001_init` применяется на старте контейнера.
- `/health` → `{"status":"ok"}`; `/health/db` → `{"status":"ok","db":1}`.
- `POST /api/organizations` → 201; дубликат → 409; reserved slug → 422; list/get работают.

---

## Чего ещё НЕТ ❌ (оставшаяся часть Phase 1)

- **`perum-core/app/services/tenant_provisioner.py`** — реальный провижининг через Docker SDK: рендеринг шаблона стека, `compose up`, ожидание healthy, `alembic upgrade head`, сидинг defaults. **Сейчас `POST /api/organizations` только пишет строку в БД, стек не поднимается.**
- **`deploy/stack-templates/org-stack.docker-compose.yml.tmpl`** + `env.tmpl` — шаблоны per-org стека (есть в PLAN.md, в репо ещё нет файла).
- **`perum-core/app/services/caddy_admin.py`** — добавление маршрута орг через Caddy admin API (порт 2019).
- **`perum-core/app/core/docker_client.py`** — обёртка над Docker SDK (compose_up, exec, inspect, wait_for_healthy).
- **`perum-core/app/routers/provisioning.py`** — эндпоинты запуска/остановки/обновления стеков.
- **`perum-core/app/routers/domains.py`** — `/internal/validate-domain` для on-demand TLS (нужно для Phase 4, можно заложить раньше).
- **`platform_admin` авторизация** — login, JWT, sessions (сейчас API организаций открыт без auth).
- **CLI** `perum-core create-org` (упомянут в PLAN.md как способ провижининга).
- **perum-tenant образ** — даже пустой каркас FastAPI, чтобы провижининг было чем наполнять стек (`ghcr.io/syb1v/perum-tenant`). Это формально начало Phase 2, но `tenant_provisioner` без образа не проверить end-to-end.
- **CI** `.github/workflows/test.yml` (pytest + tsc).

---

## Следующие шаги (рекомендуемый порядок)

1. **`docker_client.py`** — тонкая обёртка над `docker` SDK (compose up/down, exec, inspect health, wait_for_healthy).
2. **Шаблоны стека** `deploy/stack-templates/org-stack.docker-compose.yml.tmpl` + `env.tmpl` (взять из PLAN.md раздел «Per-org стек», добавить `${IMAGE_REGISTRY}` для базовых образов).
3. **perum-tenant минимальный каркас** — FastAPI с `/health`, читающий `ORG_SLUG` из ENV; Dockerfile; собрать локально образ `perum-tenant:dev` (или запушить в GHCR). Без него провижининг не проверить.
4. **`tenant_provisioner.py`** — собрать шаги 4-8 из PLAN.md (рендер → compose up → healthy → alembic → seed). Завязать на `POST /api/organizations` (заменить текущий stub: после записи в БД — поднять стек).
5. **`caddy_admin.py`** — `add_route`/`remove_route` через `PATCH/POST http://caddy:2019/...`. После провижининга добавлять `<slug>.perum.local → org_<slug>_app:3000`.
6. **platform_admin auth** — закрыть `/api/organizations` JWT-аутентификацией.
7. **Smoke-тест Phase 1 end-to-end:** `POST /api/organizations {slug:acme}` → `docker ps` показывает `org_acme_app` + `org_acme_db` → `curl http://acme.perum.local/health` → 200.

После этого Phase 1 закрыта, переходим к Phase 2 (полноценный tenant auth + модели).

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

- **CHANGELOG.md** — при каждом заметном изменении добавлять запись и поднимать версию (`0.0.x`). На русском, человеческим языком, свежее сверху. Текущая версия: `0.0.6`.
- Коммитим осмысленными порциями; пуш в `main` — по ходу работы.

## Зафиксированные решения (не пересматривать без запроса)

- **Изоляция: silo per org** (1 орг = 1 docker-стек). Пользователь выбрал сознательно вместо schema-per-org.
- **DNS: Cloudflare** (wildcard `*.perum.ru` + custom domains). **Регистратор: Beget** (API нет).
- **Прод: generic Ubuntu + SSH**, управление через Docker. Cloud-провайдер неважен.
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
