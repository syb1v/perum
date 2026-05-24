# PERUM v2 — полный план редизайна (roadmap + детальный план)

> **Это рабочий план всего проекта.** Скопирован из плановой сессии, чтобы быть под рукой в каждой новой сессии. Текущий статус и точка возобновления — в [PROGRESS.md](PROGRESS.md). Архитектурные детали — в [ARCHITECTURE.md](ARCHITECTURE.md) и соседних доках.

## Контекст

Старый PERUM (`/home/sybiv/Рабочий стол/PERUM`, `main` @ `ab05891`) — зрелый монолит ~68k LOC (бэкенд ~21k Python + фронтенд ~47k TS/TSX), 27 Alembic-миграций, 175 эндпоинтов. Мультитенантность реализована **row-level** через колонку `school_id` в 25+ таблицах и набор утилит в `app/utils/tenant.py` (`is_system_admin`, `ensure_tenant_access`, `ensure_same_school`).

**Боль текущей модели (из аудитов `docs/AUDIT_2026-04-17.md`, `docs/AUDIT_2026-04-26.md`):**

1. **Тенант-изоляция держится на дисциплине, а не на инварианте.** Каждый запрос должен помнить `WHERE school_id = ?`. Пропустить легко — IDOR-находки в `journal.py` (`GET /grades/{grade_id}` — `crud_journal.get_grade_by_id` без школьного фильтра), `app/market/repository.py` (`get_item_by_id`), `app/crud/crud_school.py:91-98`.
2. **Костыль "orphaned records"** в `update.sh:82-100` — на каждом деплое диагностируются записи с `school_id IS NULL`.
3. **Нет понятия "Организация".** `School` (`app/models.py:12-21`) — единственный уровень тенанта. Нельзя сгруппировать несколько школ под одного владельца.
4. **Один домен на всё.** `Caddyfile:22` — только `xn--l1afdm2c.xn--p1ai`. `School.domain_alias` есть, но не используется.
5. **Жирные роутеры без сервисного слоя.** `admin_school.py` (1995 LOC), `schedule.py` (1310), `journal.py` (1251), `exchange.py` (970).
6. **Контрольная плоскость размазана по приложению.** Управление школами, бизнес-логика, биллинг, мониторинг — всё в одном FastAPI.
7. **WebSocket** валидирует только `user_id`, не проверяет `school_id` при ретрансляции (`app/main.py:209-267`).

**Решения, принятые пользователем:**

- **Изоляция: silo per organization.** Каждая орг — отдельный Docker-стек (FastAPI + Postgres), физически изолированный.
- **Объём первого релиза: полный rewrite со всеми фичами**, ~16-20 недель.
- **Домены: `*.perum.ru` + кастомные домены** через Caddy on-demand TLS.
- **Старый прод (пэрум.рф) остаётся в read-only** — новые орг в новой системе, миграция старых через ~6 месяцев (опционально).
- **Дизайн и функционал — из легаси (эталон).** UI/UX и набор фич берём из исходников старого ПЭРУМ (GitHub `R1dnis/PERUM`, локально `/home/sybiv/Рабочий стол/PERUM`). Не изобретаем экраны/темы/фичи с нуля — **портируем внешний вид и поведение** старого приложения, адаптируя под новую архитектуру (silo-per-org, router→service→repository, модульный фронт). Перед каждой новой страницей/фичей — сверяться с тем, как это сделано в легаси, и повторять.

**Цель репозитория `https://github.com/syb1v/perum.git`:**

- Полная физическая изоляция данных между организациями (орг = stack).
- Иерархия Organization → School → User; внутри орг — несколько школ.
- Control plane как отдельный сервис: создаёт стеки, провижинит домены, метрики, биллинг.
- Чистая модульная архитектура (router → service → repository).
- Каждая орг получает поддомен `*.perum.ru` + опционально кастомный домен.

---

## Архитектура: silo per organization

```
                   ┌────────────────────────────────────────────────┐
                   │ PERUM Control Plane  (perum-core)              │
                   │ Домен: admin.perum.ru                          │
                   │ - CRUD организаций                             │
                   │ - Провижининг docker-стеков орг                │
                   │ - Управление кастомными доменами + on-demand   │
                   │   TLS validate endpoint                        │
                   │ - Биллинг (stubs), подписки                    │
                   │ - Мониторинг (сбор метрик с org stacks)        │
                   │ - Раскатывание миграций по орг (rolling)       │
                   │ Своя БД: perum_control_db                      │
                   └─────────┬──────────────────────────────────────┘
                             │ docker compose CLI / Docker SDK
                             ▼
       ┌─────────────────────────────────────────────────────────────┐
       │ Центральный Caddy (front-proxy, общий для всех орг)         │
       │ admin.perum.ru     → perum-core:3000                        │
       │ acme.perum.ru      → org_acme_app:3000     (wildcard cert)  │
       │ kuban-edu.ru       → org_kuban_app:3000    (on-demand TLS)  │
       └─────────────────────────────────────────────────────────────┘
                             ▼
      ┌──────────────────────────────────────────────────────────────┐
      │ Per-org docker stacks (silo)                                 │
      │  org_acme/                  org_xyz/                         │
      │   ├─ org_acme_app           ├─ org_xyz_app                   │
      │   ├─ org_acme_db            ├─ org_xyz_db                    │
      │   └─ volume org_acme_data   └─ volume org_xyz_data           │
      │  shared_redis (общий, разделён по db-index)                  │
      │  Каждый стек: ENV ORG_SLUG, держит 1..N школ через school_id │
      └──────────────────────────────────────────────────────────────┘
```

### Деплоймент-режимы

| Режим | Где живут стеки орг | Когда |
|---|---|---|
| **shared_host** (по умолчанию) | Все стеки на одной VM, сеть `perum_internal` | Большинство орг. Дёшево, изоляция уровня контейнеров. |
| **dedicated_vm** | Каждая орг = отдельная VM (SSH+docker, Phase 9) | Крупные/премиум-орг, compliance, нагрузка. |

### Роли (см. [ROLES.md](ROLES.md))

`platform_admin` (control plane) → `org_admin` (орг) → `school_admin`/`director` (школа) → `teacher`/`student`/`parent`. Внутри org-stack школы изолированы через `school_id`.

---

## Структура репозитория (целевая)

```
perum/
├── perum-core/        # Control Plane (FastAPI). admin.perum.ru
│   ├── app/{routers,services,core,schemas}/  models.py  main.py
│   ├── migrations/    # Alembic для perum_control_db
│   └── Dockerfile  requirements.txt
├── perum-tenant/      # Tenant App — единый образ, N+1 инстансов
│   ├── app/core/      # config(ORG_SLUG), auth(JWT+org_slug), db, telemetry, ws_manager
│   ├── app/modules/   # auth, org_admin, school_admin, academic, journal, parsers,
│   │                  #   exchange, market, quests, leaderboards, news, analytics,
│   │                  #   parent, appeals  (каждый: router → service → repository)
│   ├── app/models/    # organization, school, user, academic, schedule, grade,
│   │                  #   homework, exchange, market, quest, news
│   ├── migrations/  tests/{unit,integration,e2e}  Dockerfile  requirements.txt
├── perum-web/         # Next.js, один билд, multi-tenant
│   ├── src/app/(platform)/   # admin.perum.ru — Control Plane UI
│   ├── src/app/(tenant)/     # *.perum.ru + кастомные — org-admin/school-admin/teacher/student/parent
│   ├── src/lib/       # tenant-context.ts, api.ts, roles.ts
│   └── src/middleware.ts     # route platform vs tenant + RBAC
├── deploy/
│   ├── caddy/         # Caddyfile (dev) + Caddyfile.tmpl (prod, on-demand TLS)
│   ├── stack-templates/  # org-stack.docker-compose.yml.tmpl + env.tmpl
│   ├── docker-compose.core.yml  # control plane + caddy + control_db + shared_redis
│   ├── prometheus/  grafana/  scripts/  # backup-org.sh, seed-defaults.py
├── docs/   .github/workflows/{test,build,deploy}.yml   README.md
```

---

## Ключевые архитектурные решения

### 1. Per-org стек — шаблон docker-compose (`deploy/stack-templates/org-stack.docker-compose.yml.tmpl`)

```yaml
name: org_{{ org_slug }}
services:
  app:
    image: ghcr.io/syb1v/perum-tenant:{{ tenant_version }}
    container_name: org_{{ org_slug }}_app
    environment:
      ORG_SLUG: {{ org_slug }}
      ORG_NAME: "{{ org_name }}"
      DATABASE_URL: postgresql://perum:{{ db_password }}@org_{{ org_slug }}_db:5432/perum
      REDIS_URL: redis://shared_redis:6379/{{ redis_db_index }}
      CONTROL_PLANE_URL: http://perum_core:3000
      TELEMETRY_TOKEN: {{ telemetry_token }}
      SECRET_KEY: {{ secret_key }}
    networks: [perum_internal]
    depends_on:
      db: { condition: service_healthy }
    restart: unless-stopped
  db:
    image: ${IMAGE_REGISTRY:-docker.io}/library/postgres:15-alpine
    container_name: org_{{ org_slug }}_db
    environment:
      POSTGRES_USER: perum
      POSTGRES_PASSWORD: {{ db_password }}
      POSTGRES_DB: perum
    volumes: [org_{{ org_slug }}_data:/var/lib/postgresql/data]
    networks: [perum_internal]
    healthcheck: { test: ["CMD-SHELL", "pg_isready -U perum"], interval: 5s }
volumes:
  org_{{ org_slug }}_data:
networks:
  perum_internal: { external: true }
```

Замечания: один общий `shared_redis` (только кэш, db-index на орг); общая сеть `perum_internal`; у каждой орг свой Postgres + volume.

### 2. Провижининг новой орг (`POST /api/organizations` в perum-core)

```python
async def create_organization(payload):
    # 1. валидация slug + биллинг(stub)
    # 2. запись в perum_control_db.organizations
    # 3. генерация секретов (db_password, secret_key, telemetry_token)
    # 4. рендеринг compose из шаблона → deploy/stacks/org_<slug>.yml
    # 5. docker compose -p org_<slug> up -d
    # 6. wait_for_healthy(org_<slug>_app)
    # 7. docker exec org_<slug>_app alembic upgrade head
    # 8. docker exec ... python -m app.scripts.seed_defaults
    # 9. создание org_admin (HTTP RPC к org_app или docker exec)
    # 10. caddy_admin.add_route(<slug>.perum.ru → org_<slug>_app:3000)
    # 11. инвайт org_admin на email
```

Подробно по шагам и cleanup при ошибке — [PROVISIONING.md](PROVISIONING.md).

### 3. Central Caddy с on-demand TLS (`deploy/caddy/Caddyfile.tmpl`)

```caddy
{
    on_demand_tls {
        ask https://admin.perum.ru/internal/validate-domain
        interval 2m
        burst 5
    }
}
admin.perum.ru { reverse_proxy perum_core:3000 }
*.perum.ru {
    tls { dns cloudflare {env.CLOUDFLARE_API_TOKEN} }   # DNS-01, см. решения ниже
    # маршруты орг добавляются control plane через Caddy admin API
}
# кастомные домены добавляются control plane через admin API:
# kuban-edu.ru { tls { on_demand }  reverse_proxy org_kuban_app:3000 }
```

Поток кастомного домена (subdomain + on-demand TLS) — [DOMAINS.md](DOMAINS.md).

### 4. Авторизация: JWT привязан к org, валидируется по hostname

JWT payload: `{user_id, school_id, org_slug, role, session_token, exp}`. В tenant middleware: если `payload.org_slug != settings.ORG_SLUG` → 401. Защита от token reuse между орг.

### 5. Изоляция нескольких школ внутри одной орг

Внутри `org_acme_app`: одна Organization (мета), 1..N School, все таблицы с `school_id NOT NULL`, утилита `ensure_same_school(user, entity.school_id)`. `org_admin` видит все школы орг. Между орг — физическая изоляция. Подробнее — [TENANT_ISOLATION.md](TENANT_ISOLATION.md).

### 6. Обновление версии tenant — модель «всё по кнопке» (`rollout_service.py`)

Платформа **не пушит** обновления. Control plane выступает «дирижёром»:
**публикует** релиз (версия + тег образа + changelog), а каждая орг видит
уведомление в админке и обновляется **одной кнопкой когда захочет** (pull /
opt-in). Обновление volume-preserving: recreate только `org_<slug>_app` с новым
образом → `alembic upgrade head`; БД, volume и настройки школы не трогаются. Орг
независимы, обновляются в своём темпе. **Принудительных/авто-обновлений нет — даже
секьюрити-патчи по кнопке орг** (платформа лишь помечает релиз критичным).
Forward-compatible миграции обязательны (удаление колонок — отдельным релизом).
Multi-host (`dedicated_vm`) — через агент-контейнер на VM (модель Remnawave
panel↔node), не SSH. См. [DEPLOYMENT.md](DEPLOYMENT.md).

### 7. Бэкапы и observability

- Бэкап: ежедневный `pg_dump` каждого `org_*_db`, ротация 30 дней (`deploy/scripts/backup-org.sh`).
- Метрики: `org_app` шлёт heartbeat каждые 30 сек в control plane → Prometheus → Grafana.
- Логи: stdout контейнеров → Loki/promtail с тегом `org_slug`.
- Sentry: SENTRY_DSN через ENV.

---

## Фазы реализации (16-20 недель)

### Фаза 0 — Подготовка (1 неделя) ✅ ВЫПОЛНЕНО
- Репозиторий, структура monorepo, архитектурные доки, .gitignore. Первый commit.

### Фаза 1 — Control Plane + Provisioning (3 недели) ✅ ВЫПОЛНЕНО
- `perum-core`: Organization model, CRUD, провижининг стеков через Docker SDK.
- Шаблоны `deploy/stack-templates/*.tmpl` и рендеринг.
- Central Caddy: routing на `admin.perum.ru` + динамическое добавление маршрутов через admin API.
- Билд perum-tenant образа (пустой каркас FastAPI) → GHCR.
- Провижининг тестовой орг через CLI: `perum-core create-org --slug=acme`.
- Smoke: `curl admin.perum.local/api/organizations` → видна acme; `curl acme.perum.local/health` → 200.

### Фаза 2 — Tenant skeleton + Auth (2 недели) ✅ ВЫПОЛНЕНО
- `perum-tenant`: auth (login, JWT с `org_slug`, sessions в БД, password change).
- Tenant middleware: валидация `payload.org_slug == settings.ORG_SLUG`.
- Модели Organization, School, User.
- API: `/auth/login`, `/auth/me`, `/auth/logout`, `/auth/change-password`.
- E2E: создать орг → org_admin → login → /me → токен на чужую орг → 401.

### Фаза 3 — Frontend skeleton + multi-tenant routing (2 недели) ✅ ВЫПОЛНЕНО (адаптирован легаси-фронт)
- `perum-web`: layout, AuthContext, API-клиент (base = current host).
- Middleware: `(platform)` если host=admin.perum.ru, иначе `(tenant)`.
- Страницы: login, dashboard-stubs всех ролей. Platform UI: список + создание орг.

### Фаза 4 — Custom domains + on-demand TLS (1 неделя) ⬜ НЕ НАЧАТО
- `perum-core`: `/internal/validate-domain` для Caddy. Поток подключения кастом-домена в UI.

### Фаза 5 — Academic core (3 недели) ✅ ВЫПОЛНЕНО (хвосты — в PROGRESS)
- Модели: Class, Subject, AcademicYear, SchoolPeriod, BellSchedule, Schedule, LessonGroup, TeacherSubject.
- Роутеры school_admin (CRUD классов/предметов/расписания), teacher (свои классы). RBAC на 3 уровня.

### Фаза 6 — Журнал и оценки (3 недели) 🔶 В РАБОТЕ
- Модели: Grade, FinalGrade, WorkType, Topic, Homework, ControlWork, HomeworkAttachment.
- Сервисы: `journal_service.add_grade`, `points_calculator`. Парсер PDF (порт из старого).

### Фаза 7 — Геймификация (3 недели) ⬜ НЕ НАЧАТО
- Transaction, ShopItem, UserInventory, GiftUpgradeAsset/Bundle, MarketDeliveryCode, Investment, SubjectAverage, TradingWindow, ExchangeSettings, Quest, UserQuest.
- Сервисы: market, exchange_jobs (background), quest_engine.

### Фаза 8 — Аналитика, новости, апелляции, родители (2 недели) ⬜ НЕ НАЧАТО
- News, NewsLike, NewsRead, GradeAppeal, ContactInquiry, ParentStudent, PageVisit. Leaderboards, teacher analytics.

### Фаза 9 — Биллинг (stubs) и observability (2 недели) ⬜ НЕ НАЧАТО
- `perum-core`: подписки/инвойсы как **заглушки** (без платёжных систем). Heartbeat-метрики, Grafana, бэкапы.

### Фаза 10 — Hardening, тесты, документация (1-2 недели) ⬜ НЕ НАЧАТО
- Матрица RBAC-тестов (роль × эндпоинт). Isolation E2E (cross-org 401, cross-school 404). Загрузочное (k6).

### Фаза 11 — Прод-деплой и onboarding (1 неделя) ⬜ НЕ НАЧАТО

> Актуальный статус всех фаз — в [PROGRESS.md](PROGRESS.md), раздел «Статус по фазам».
- Ubuntu VM, central Caddy, perum-core, мониторинг. Onboarding pilot-орг.

### За пределами 20 недель — миграция со старого ПЭРУМ (опционально)
- Старый `пэрум.рф` в read-only ~6 месяцев. Экспортёр `legacy_migrator.py` — только если решим мигрировать. См. [MIGRATION_FROM_LEGACY.md](MIGRATION_FROM_LEGACY.md).

---

## Критические файлы (целевые)

| Файл | Назначение |
|---|---|
| `perum-core/app/services/tenant_provisioner.py` | Генерация/запуск per-org стека, healthy, миграции, сидинг. |
| `perum-core/app/services/caddy_admin.py` | Маршруты орг через Caddy admin API. |
| `perum-core/app/routers/domains.py` | `/internal/validate-domain` для on-demand TLS. |
| `perum-core/app/services/rollout_service.py` | Раскатывание версии tenant на все орг (canary). |
| `perum-core/app/services/metrics_collector.py` | Приём heartbeat от org_app. |
| `perum-tenant/app/core/config.py` | Чтение `ORG_SLUG`/`DATABASE_URL` — tenant identity. |
| `perum-tenant/app/core/auth.py` | JWT с `org_slug`, валидация по hostname. |
| `perum-tenant/app/modules/journal/service.py` | add_grade, compute_final_grade. |
| `perum-tenant/app/modules/market/service.py` | Покупки, gift upgrades, инвентарь. |
| `perum-tenant/app/modules/exchange/service.py` | Биржа, инвестиции, торговые окна. |
| `perum-tenant/app/modules/parsers/journal_pdf.py` | Порт PDF-парсера журнала. |
| `perum-web/src/middleware.ts` | Route platform vs tenant + RBAC. |
| `perum-web/src/lib/tenant-context.ts` | org_slug из `window.location.host`. |
| `perum-web/src/lib/roles.ts` | Единый источник правды RBAC на фронте. |
| `deploy/stack-templates/org-stack.docker-compose.yml.tmpl` | Шаблон стека орг. |
| `deploy/caddy/Caddyfile.tmpl` | Шаблон central Caddy с on-demand TLS. |

---

## Что переиспользуем как референс из старого PERUM (`/home/sybiv/Рабочий стол/PERUM`)

**Бизнес-логика (адаптируем):**
- `app/services/parsers/` + `app/services/journal_importer.py` — парсинг PDF, словарь `SUBJECT_ALIASES`.
- `app/services/points_calculator.py` — расчёт ливок (weighted scoring).
- `app/services/exchange_jobs.py` — торговые окна и дивиденды.
- `app/services/migration_service.py` — миграция учебного года (архив 11 классов).
- `app/services/quests.py` — триггеры квестов (positive_grades, raise_avg, daily_login).

**Модели данных (структура полей):** `app/models.py` + `app/market/models.py` — Grade, FinalGrade, WorkType, Topic, ShopItem, UserInventory, Quest, UserQuest, Transaction, Investment, SubjectAverage, TradingWindow, News, GradeAppeal. Копируем поля, но `school_id NOT NULL` и soft-delete вместо cascade.

**Frontend:** `frontend/src/app/student/market/` (CSS-анимации gift upgrades), `frontend/src/components/admin/MarketManagement.tsx` (формы, разбить), `frontend/src/utils/{reportGenerator,exportUtils}.ts`.

**Что НЕ переиспользуем:** жирные роутеры (переписать модульно), `app/utils/tenant.py` (изоляция на уровне процесса), orphaned-records костыли, `fix_n_plus_one.py`/`fix_ilike.py`, JWT decode в Next.js middleware без проверки подписи.

---

## Verification (после ключевых фаз)

```bash
# Фаза 1: provisioning
curl -X POST https://admin.perum.local/api/organizations -d '{"slug":"acme","name":"Acme"}'
docker ps | grep org_acme            # org_acme_app + org_acme_db
curl https://acme.perum.local/health # 200

# Фаза 2: auth
TOKEN=$(curl -X POST https://acme.perum.local/api/auth/login -d '{...}' | jq -r .access_token)
curl https://acme.perum.local/api/auth/me -H "Authorization: Bearer $TOKEN"   # org_admin
curl https://xyz.perum.local/api/auth/me  -H "Authorization: Bearer $TOKEN"   # 401

# Фаза 10: isolation matrix
pytest tests/e2e/isolation/ -v        # cross-org 401, cross-school 404
```

---

## Зафиксированные инфраструктурные решения

> Эти вопросы были открытыми на этапе планирования и теперь решены (см. [PROGRESS.md](PROGRESS.md)).

- **DNS-провайдер: Cloudflare.** Для wildcard `*.perum.ru` (DNS-01) и custom domains. В Caddy: `tls { dns cloudflare {env.CLOUDFLARE_API_TOKEN} }`. NS домена переводятся на Cloudflare.
- **Регистратор `perum.ru`: Beget** (API нет — поэтому DNS вынесен на Cloudflare).
- **Прод-VM: generic Ubuntu, доступ по SSH.** Конкретный cloud неважен — управление через Docker. `shared_host` использует локальный Docker socket; `dedicated_vm` — SSH+docker (Phase 9).
- **Биллинг: заглушки на всех фазах.** Без интеграции с ЮKassa/Stripe. `billing_service.py` возвращает stub-данные. Реальная интеграция — пост-Phase-11.
- **Docker Hub в РФ блокируется** (EOF на скачивании слоёв). Базовые образы тянутся через зеркало: `IMAGE_REGISTRY=mirror.gcr.io` или `/etc/docker/daemon.json` registry-mirrors. См. [DEPLOYMENT.md](DEPLOYMENT.md).
