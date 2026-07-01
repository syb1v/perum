# Архитектура PERUM (v2)

> ⚠️ **Актуальная модель (с 2026-05-25): «узел организации», silo = ШКОЛА.**
> Каждая ШКОЛА — отдельный docker-стек (контейнер `app` + БД + volume); `School` —
> ребёнок `Organization` (`School.org_id`). Провижинит и обновляет школы «по воздуху»
> по кнопке `org_admin` (узел орг); ядро держит только метаданные и внутрь школьных
> данных не лезет. См. **[ARCH_ORG_NODE.md](ARCH_ORG_NODE.md)**.
> Часть текста ниже ещё описывает прежнюю модель «silo = организация» (несколько школ
> в одном инстансе орг) — это **устарело**; ориентируйся на ARCH_ORG_NODE.md и на
> дату-секцию «Обновление 2026-06-13» в конце файла.

> Этот документ описывает общую структуру системы. Подробности изоляции — в [TENANT_ISOLATION.md](TENANT_ISOLATION.md). Подробности провижининга — в [PROVISIONING.md](PROVISIONING.md). RBAC — в [ROLES.md](ROLES.md).

## Зачем переделывали

Предыдущая версия PERUM (`/home/sybiv/Рабочий стол/PERUM`) — монолит ~68k LOC с row-level multi-tenancy через колонку `school_id`. Эта модель имеет два структурных недостатка:

1. **Изоляция держится на дисциплине.** Каждый новый SQL-запрос должен помнить `WHERE school_id = ?`. На практике это приводило к IDOR-утечкам (выявлены в аудитах: `journal.py:264-306` `GET /grades/{id}` без школьного фильтра; `app/market/repository.py` `get_item_by_id` без `school_id`; `app/crud/crud_school.py:91-98`). Костыль `update.sh:82-100` чинил «осиротевшие» записи на каждом деплое.
2. **Один уровень тенанта.** Сущность `School` была единственным владельцем данных. Невозможно сгруппировать несколько школ под одного владельца (управление образования, частная сеть, репетиторский центр с филиалами).

Новая архитектура устраняет оба ограничения через **silo-per-organization**: одна организация = один полностью изолированный процесс с собственной БД. Утечка между организациями физически невозможна без эксплойта в Docker / Linux. Внутри организации действует понятная иерархия `Organization → School(1..N) → User`.

## Высокоуровневая схема

```
                ┌──────────────────────────────────────────────────┐
                │  Control Plane (perum-core)                      │
                │  Домен: admin.perum.ru                           │
                │                                                  │
                │  - CRUD организаций                              │
                │  - Провижининг docker-стеков орг                 │
                │  - Validate-endpoint для on-demand TLS Caddy     │
                │  - Биллинг, подписки, инвойсы                    │
                │  - Сбор метрик (heartbeat от tenant)             │
                │  - Rolling-обновление tenant-образа              │
                │                                                  │
                │  Своя БД: perum_control_db                       │
                └────────────┬─────────────────────────────────────┘
                             │
                             │  Docker API (через docker_proxy) / Caddy admin API
                             ▼
       ┌──────────────────────────────────────────────────────────────┐
       │  Central Caddy (front-proxy)                                 │
       │                                                              │
       │  admin.perum.ru     → perum-core:3000                        │
       │  acme.perum.ru      → org_acme_app:3000  (wildcard cert)     │
       │  xyz.perum.ru       → org_xyz_app:3000   (wildcard cert)     │
       │  kuban-edu.ru       → org_kuban_app:3000 (on-demand TLS)     │
       └────────────┬─────────────────────────────────────────────────┘
                    │
                    ▼
      ┌──────────────────────────────────────────────────────────────┐
      │  Per-org docker stacks (silo)                                │
      │                                                              │
      │  org_acme/                       org_xyz/                    │
      │   ├─ org_acme_app (FastAPI)      ├─ org_xyz_app              │
      │   ├─ org_acme_db (Postgres)      ├─ org_xyz_db               │
      │   └─ volume org_acme_data        └─ volume org_xyz_data      │
      │                                                              │
      │  shared_redis (общий, разделён по db-index)                  │
      └──────────────────────────────────────────────────────────────┘
```

## Сервисы

### perum-core (Control Plane)

Отдельный FastAPI-сервис. Не содержит ни одной строки бизнес-логики школ. Отвечает за:

- **Организации.** CRUD сущности `Organization` (slug, name, plan, status, deployment_mode, custom_domain). См. [PROVISIONING.md](PROVISIONING.md).
- **Провижининг.** Генерация и запуск per-school docker-стека через Docker API. **Ядро НЕ монтирует `/var/run/docker.sock`** — сокет (RO) есть только у сервиса `docker_proxy` (tecnativa/docker-socket-proxy, фильтрует разрешённые методы API), ядро ходит к демону по `DOCKER_HOST=tcp://docker_proxy:2375` (см. #7 в дату-секции). Применение Alembic-миграций. Сидинг дефолтных данных. Регистрация маршрута в central Caddy.
- **Домены.** Endpoint `GET /internal/validate-domain` для Caddy on-demand TLS. См. [DOMAINS.md](DOMAINS.md).
- **Биллинг.** Подписки, инвойсы, интеграция с платёжным провайдером. (Phase 9.)
- **Observability.** Приём heartbeat от `org_*_app` каждые 30 секунд, агрегация в Prometheus. Список и health всех орг.
- **Релизы и обновления.** Релиз тенанта привязан к **реальному коду**: `Release.source_commit` (миграция 0014), publish отклоняет релиз, чей образ/коммит совпадает с текущим (нет реального обновления). CI авто-регистрирует релиз и changelog; обновления школ — opt-in по кнопке `org_admin`. Полный процесс — в **[RELEASING.md](RELEASING.md)** (не дублируем здесь).

Своя БД `perum_control_db` (PostgreSQL). НЕ содержит данных школ.

### perum-tenant (Tenant App)

Один Docker-образ. **Запускается N+1 раз** — по одному инстансу на организацию. Каждый запуск получает в ENV свою идентичность:

```
ORG_SLUG=acme
ORG_NAME="Acme Education"
DATABASE_URL=postgresql://perum:...@org_acme_db:5432/perum
SECRET_KEY=...
CONTROL_PLANE_URL=http://perum_core:3000
TELEMETRY_TOKEN=...        # heartbeat/телеметрия → ядро
INTERNAL_RPC_TOKEN=...     # RPC ядро→тенант на /internal (отдельный секрет, см. #6)
```

> **Изоляция токенов (#6).** `internal_rpc_token` и `telemetry_token` — разные секреты
> (`SchoolSecret`, миграция 0013). Ядро шлёт оба заголовка; тенант с заданным
> `INTERNAL_RPC_TOKEN` принимает на `/internal` ТОЛЬКО его (telemetry-токен туда больше
> не пускает). Сравнение — constant-time.

Внутри одного инстанса:
- Одна `Organization` (мета-сущность для этого стека).
- 1..N `School` (`School` модель с `org_id` FK).
- Все остальные таблицы (User, Class, Subject, Grade, Transaction, ShopItem, ...) имеют `school_id NOT NULL`.
- Изоляция школ внутри орг — через `school_id` (row-level). См. [TENANT_ISOLATION.md](TENANT_ISOLATION.md) почему это безопасно на этом уровне (в отличие от старой версии).

Модули (фича-папки в `perum-tenant/app/modules/`):
- `auth` — login, JWT, sessions, password change.
- `org_admin` — управление школами организации.
- `school_admin` — управление школой (классы, предметы, расписание).
- `academic` — Class, Subject, AcademicYear, SchoolPeriod, BellSchedule, Schedule.
- `journal` — Grade, FinalGrade, Homework, ControlWork.
- `parsers` — импорт PDF-журналов (порт логики из старого PERUM).
- `exchange` — биржа предметов и инвестиций.
- `market` — маркет товаров, gift upgrades.
- `quests` — квесты и достижения.
- `leaderboards` — рейтинги.
- `news` — новости школы.
- `analytics` — аналитика учителя, метрики.
- `parent` — read-only API для родителя.
- `appeals` — апелляции оценок.

Внутри каждого модуля действует паттерн `router → service → repository`. Без жирных файлов.

### perum-web (Next.js)

Один билд, multi-tenant. На фронте `org_slug` определяется из `window.location.host`:
- `admin.perum.ru` → control plane UI (segment group `(platform)`).
- `acme.perum.ru` / кастомный домен → tenant UI (segment group `(tenant)`).

Middleware (`perum-web/src/middleware.ts`):
1. Определяет, на каком домене мы.
2. Если control plane — пускает в `(platform)` только пользователей с `role=platform_admin`.
3. Если tenant — пускает в `(tenant)` соответствующую панель по роли из JWT (`org_admin` / `school_admin` / `teacher` / `student` / `parent`).
4. RBAC-источник правды — `perum-web/src/lib/roles.ts`. Никаких хардкодов ролей в нескольких местах (в отличие от старого PERUM, где роли были захардкожены в 4+ местах — `AUDIT_2026-04-17.md` P1-8).

API-клиент использует относительные URL `/api/...`, которые попадают в тот же домен и роутятся Caddy на нужный `org_*_app:3000`. Никаких `NEXT_PUBLIC_API_URL` — фронтенд физически не знает о других орг.

### Central Caddy

Общий reverse-proxy на хосте. Управляется control plane через Caddy admin API (`http://localhost:2019`).

- Wildcard cert для `*.perum.ru` через DNS-01 challenge.
- On-demand TLS для кастомных доменов с валидацией через `https://admin.perum.ru/internal/validate-domain`.
- Каждая новая орг добавляет в Caddy маршрут `<org_slug>.perum.ru → org_<slug>_app:3000` через admin API при провижининге.

Подробнее: [DOMAINS.md](DOMAINS.md).

### Shared Redis

Один Redis на все орг. Каждая орг получает свой `db_index` (`REDIS_URL=redis://shared_redis:6379/N`). Redis используется только для кеша и счётчиков — никаких персональных данных. Compromise: операционная простота важнее полной изоляции для эфемерных данных.

## Поток запроса (типичный сценарий)

Учитель школы `Acme Lyceum` (Organization=acme, School=acme_lyceum_1) ставит оценку:

1. Браузер открыт на `https://acme.perum.ru/teacher/journal/12/5`.
2. Caddy получает запрос на хост `acme.perum.ru`.
3. Caddy сматчил wildcard `*.perum.ru` → upstream `org_acme_app:3000`.
4. `perum-tenant` (запущенный с `ORG_SLUG=acme`) принимает запрос.
5. Auth-middleware проверяет JWT: `payload.org_slug == "acme"` (защита от token reuse).
6. RBAC dependency `require_teacher` пускает дальше.
7. `journal_service.add_grade(teacher, class_id=12, subject_id=5, grade=5)`:
   - проверяет, что класс принадлежит школе учителя (`ensure_same_school`),
   - проверяет, что учитель назначен на этот предмет в этом классе (`TeacherSubject`),
   - создаёт `Grade` + `Transaction(+ливки)`,
   - триггерит проверку квестов через `quest_engine`.
8. Ответ возвращается в браузер.

Никакая другая организация в этом потоке не участвует. Сетевое соединение с `org_xyz_app` или `org_xyz_db` физически отсутствует.

## Базовые принципы

1. **Tenant identity — фиксируется на старте процесса.** `ORG_SLUG` в ENV `org_*_app`. Поменять её на лету невозможно.
2. **JWT привязан к org.** Токен `acme`, посланный на `xyz.perum.ru`, отклоняется на middleware.
3. **DB connection — одна на стек.** `org_acme_app` не имеет credentials для `org_xyz_db`, физическая сетевая изоляция в Docker-сетях.
4. **Школа — единица row-level isolation внутри орг.** Утилиты типа `ensure_same_school()` нужны только когда в одной орг несколько школ (что норма).
5. **Control plane никогда не пишет в org-БД напрямую** — только через RPC к `org_*_app` (создание org_admin, сидинг defaults). Это гарантирует, что бизнес-инварианты валидируются tenant-приложением.

## Что было унаследовано из старого PERUM

Хотя архитектура полностью новая, не вся бизнес-логика переписывается с нуля. Эти части портируются:

- Алгоритм парсинга PDF-журналов: `app/services/journal_importer.py` + `parsers/*.py`.
- Расчёт ливок (weighted scoring): `app/services/points_calculator.py`.
- Алгоритм торговых окон биржи: `app/services/exchange_jobs.py`.
- Триггеры квестов: `app/services/quests.py`.
- Миграция учебного года: `app/services/migration_service.py`.
- Структура полей моделей: `app/models.py` + `app/market/models.py` — копируем поля, но с обязательным `school_id NOT NULL` и без cascade DELETE (soft delete для критичных сущностей).
- CSS-анимации gift upgrades: `frontend/src/app/student/market/*.module.css`.

Что не унаследовано:
- Жирные роутеры (1000-2000 LOC) — переписываются модульно.
- `app/utils/tenant.py` — больше не нужен в виде row-level guard, изоляция выше.
- Все «orphaned records» fixup-скрипты.
- JWT decode на edge runtime без проверки подписи (P1-7 audit).
- Захардкоженные роли в нескольких местах — единый `src/lib/roles.ts`.

## Деплоймент-режимы

Control plane хранит для каждой орг поле `deployment_mode`:

| Режим | Где живёт org-stack | Когда применяется |
|---|---|---|
| `shared_host` (по умолчанию) | На той же VM что и control plane, в общей docker-сети `perum_internal` | Большинство орг. Дешевле, изоляция уровня контейнеров. |
| `dedicated_vm` | Отдельная VM, своя сеть, deploy через SSH/cloud API | Крупные/премиум орг, требования compliance, высокая нагрузка. |

Phase 9 добавляет поддержку `dedicated_vm`. До этого все орг живут в `shared_host`.

## Дополнительная литература

- [TENANT_ISOLATION.md](TENANT_ISOLATION.md) — инвариант изоляции и его проверки.
- [PROVISIONING.md](PROVISIONING.md) — пошагово как создаётся новая орг.
- [DOMAINS.md](DOMAINS.md) — wildcard и custom domains.
- [ROLES.md](ROLES.md) — RBAC матрица.
- [DEPLOYMENT.md](DEPLOYMENT.md) — раскатывание новых версий и rollback.
- [RELEASING.md](RELEASING.md) — релизы (CI → GHCR), привязка релиза к коммиту, opt-in обновления.
- [AUDIT_2026-06-12.md](AUDIT_2026-06-12.md) — аудит иерархии ядро→орг→школа и закрытые находки.

## Обновление 2026-06-13

Сводка изменений, расходящихся с устаревшим текстом выше (он описывает прежнюю модель
«silo = организация»). Актуальная архитектура и детали — в перечисленных документах.

1. **silo = ШКОЛА.** Каждая ШКОЛА = отдельный docker-стек (контейнер `app` + БД +
   volume), а не «несколько школ в одном инстансе орг». `School` — ребёнок
   `Organization` (`School.org_id`). Школы провижинит и обновляет `org_admin` (узел орг);
   ядро держит только метаданные и внутрь школьных данных не лезет. (См. ARCH_ORG_NODE.md.)
2. **docker_proxy (#7).** Ядро БОЛЬШЕ НЕ монтирует `/var/run/docker.sock`. Сокет (RO)
   только у сервиса `docker_proxy` (tecnativa/docker-socket-proxy, фильтр API); ядро
   ходит к демону по `DOCKER_HOST=tcp://docker_proxy:2375`. Полный вынос в отдельный
   org-agent — будущий этап мульти-сервера.
3. **Разведение токенов (#6).** `internal_rpc_token` отделён от `telemetry_token`
   (`SchoolSecret`, миграция 0013). Ядро шлёт оба заголовка; тенант с заданным
   `INTERNAL_RPC_TOKEN` принимает на `/internal` ТОЛЬКО его (telemetry-токен туда больше
   не пускает). Сравнение токенов — constant-time.
4. **Релизы привязаны к реальному коду.** `Release.source_commit` (миграция 0014);
   publish отклоняет релиз, чей образ/коммит == текущему (нет реального обновления). CI
   (`release.yml`) по push в `main` собирает и пушит в GHCR ТОЛЬКО изменённые образы
   (`perum-core` / `perum-tenant` / `perum-web`, тег `git-<sha>` + `latest`),
   авто-регистрирует релиз тенанта (`POST /api/ci/release`) и авто-changelog из git log.
   Ченджлоги видны в консоли ядра и в баннере орг «Доступно обновление». Обновления школ —
   opt-in по кнопке. Полностью — в [RELEASING.md](RELEASING.md).
5. **Async-провижининг (#1).** create/reprovision/update школы → `202` + фоновая
   asyncio-задача (своя сессия, school-лок из `app/core/locks.py`). Пароль админа школы
   НЕ возвращается в ответе create — задаётся через «Админы» → сбросить пароль.
   Орг-консоль поллит статус.
6. **Hardening (аудит, [AUDIT_2026-06-12.md](AUDIT_2026-06-12.md)).** RBAC
   defense-in-depth — гарды на самих роутерах (`organizations`/`billing` →
   `require_platform_admin`, `schools` → `require_org_admin`), не только в
   `include_router`. Keyed asyncio-локи на жизненный цикл школы (`app/core/locks.py`).
   `purge` школы/орг требует `?confirm=<slug>`; перед purge бэкапятся БД (`pg_dump`) И
   вложения (appdata tar с валидацией gzip) — при сбое бэкапа тома НЕ сносятся. Биллинг:
   авто-enforce по расписанию (`BILLING_ENFORCE_INTERVAL_S`), дебиторка
   (`GET /api/billing/receivables`), блок понижения плана ниже использования
   (`?force=true`), read-only биллинг приостановленной орг. Caddy: `_sync_caddy_routes`
   восстанавливает maintenance-503 для замороженных школ после рестарта.
7. **Миграции / CI.** Control-БД доходит до `0014`. `ci.yml`: pytest core +
   pytest tenant `tests/unit` + `tsc` web.
