# План: Инфраструктурное управление, прозрачность и масштабирование PERUM

> Создано: 2026-06-18
> Статус: В процессе реализации
> Прогресс: см. [PROGRESS_INFRA.md](PROGRESS_INFRA.md)

---

## 1. Текущее состояние

### Что уже реализовано

| Компонент | Файл | Описание |
|-----------|------|----------|
| Enrollment нод | `app/routers/enroll.py` | One-time token handshake |
| School provisioner | `app/services/school_provisioner.py` | Полный жизненный цикл школы (локально) |
| Домены | `app/routers/schools.py`, `app/services/caddy_admin.py` | Subdomain + custom domain per school |
| OTA обновления | `app/services/school_provisioner.py` | Volume-preserving swap + auto-rollback |
| Stack spec | `app/services/stack_spec.py` | Jinja2 шаблоны |
| Org-node compose | `deploy/org-node/docker-compose.yml` | Референс для standalone ноды |
| Docker client | `app/core/docker_client.py` | Async wrapper над docker-py |

### Пробелы (что нужно добавить)

| # | Пробел | Последствие |
|---|--------|-------------|
| 1 | Нет модели **Node/Server** | Невозможно управлять парком серверов |
| 2 | Нет **capacity planning** | 100 школ на одном сервере = смерть |
| 3 | Нет **распределения школ по нодам** | Нет multi-server оркестрации |
| 4 | Нет **рекомендаций по sizing** | Админ не знает, какие ноды заказывать |
| 5 | Нет **скачиваемых скриптов** развёртывания | Всё вручную по README |
| 6 | Нет **тарифных лимитов** | Нельзя ограничивать по плану |
| 7 | Нет **дашборда инфраструктуры** | Никто не видит состояние системы |
| 8 | Нет **документации OTA** | Непонятно что, когда и как обновляется |
| 9 | Нет **привязки IP нод к организациям** | Org_admin не видит, где крутятся школы |

---

## 2. Архитектурное решение: Agent-on-Node

```
┌─────────────────────────────────────────────────────────┐
│  CORE SERVER (perum-core, ROLE=platform)                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ Control Plane │  │ Node Planner │  │ Platform UI  │  │
│  │ (orchestrator)│  │ (capacity)   │  │ (dashboards) │  │
│  └──────┬───────┘  └──────────────┘  └──────────────┘  │
│         │ HTTP API                                       │
└─────────┼───────────────────────────────────────────────┘
          │
    ┌─────┴─────┐
    │           │
┌───▼───┐   ┌──▼────┐
│NODE 1 │   │NODE 2 │   ← org-node серверы
│       │   │       │
│Agent  │   │Agent  │   ← perum-core ROLE=org_agent
│Docker │   │Docker │   ← локальный docker_proxy
│Schools│   │Schools│   ← school_X_app + school_X_db
└───────┘   └───────┘
```

**Принцип:** Ядро отправляет команды агенту на ноде через HTTP. Агент выполняет Docker-операции локально. Ядро не имеет SSH-доступа к нодам.

---

## 3. Этапы реализации

### Этап 1: Модели данных и миграции (P0, ~3ч)

**Новые таблицы:**

#### Node (серверная нода)

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | UUID | PK |
| `name` | String(64) | Человекочитаемое имя (e.g., "node-01") |
| `hostname` | String(255) | IP или FQDN |
| `ssh_port` | Integer | Порт SSH (default 22) |
| `cpu_cores` | Integer | Кол-во ядер |
| `ram_gb` | Float | Объём RAM |
| `disk_gb` | Float | Объём диска |
| `status` | Enum | `pending_bootstrap`, `active`, `draining`, `offline`, `decommissioned` |
| `org_id` | FK → Organization | Какая организация владеет (nullable = пул) |
| `enrollment_token_id` | FK → EnrollmentToken | Связь с enrollment |
| `agent_version` | String(32) | Версия агента |
| `last_heartbeat` | DateTime | Последний heartbeat |
| `max_schools` | Integer | Макс. школ (рассчитывается или вручную) |
| `created_at` | DateTime | Создана |
| `updated_at` | DateTime | Обновлено |

#### NodeAssignment (привязка школы к ноде)

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | UUID | PK |
| `node_id` | FK → Node | На какой ноде |
| `school_id` | FK → School | Какая школа |
| `assigned_at` | DateTime | Когда назначена |

#### UpdateHistory (история OTA-обновлений)

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | UUID | PK |
| `school_id` | FK → School | Какая школа |
| `from_version` | String(32) | Откуда |
| `to_version` | String(32) | Куда |
| `status` | Enum | `pending`, `success`, `failed`, `rolled_back` |
| `started_at` | DateTime | Начало |
| `completed_at` | DateTime | Завершение |
| `error_message` | Text | Если failed |

#### Расширение Organization (тарифные лимиты)

| Поле | Тип | Default | Описание |
|------|-----|---------|----------|
| `plan_tier` | String(32) | `"starter"` | `free`, `starter`, `pro`, `enterprise` |
| `max_schools` | Integer | 5 | Макс. школ по тарифу |
| `max_custom_domains` | Integer | 1 | Макс. кастомных доменов |
| `custom_landing_enabled` | Boolean | False | Разрешены ли кастомные лендинги |
| `max_nodes` | Integer | 1 | Макс. серверных нод |

**Миграции:**
- `0015_add_nodes.py` — таблицы Node, NodeAssignment
- `0016_add_plan_limits.py` — поля Organization
- `0017_add_update_history.py` — таблица UpdateHistory

**Файлы:**
- `perum-core/app/models.py` — добавить модели
- `perum-core/app/schemas/node.py` — Pydantic-схемы
- `perum-core/app/migrations/versions/0015_*.py`
- `perum-core/app/migrations/versions/0016_*.py`
- `perum-core/app/migrations/versions/0017_*.py`

---

### Этап 2: Agent API на ноде (P0, ~4ч)

Расширить `perum-core/app/agent/` для управления школами на удалённой ноде.

**Новые endpoints агента:**

| Метод | Путь | Описание |
|-------|------|----------|
| `POST` | `/agent/schools/provision` | Развернуть школу на этой ноде |
| `POST` | `/agent/schools/{slug}/update` | OTA-обновление школы |
| `POST` | `/agent/schools/{slug}/suspend` | Остановить школу |
| `POST` | `/agent/schools/{slug}/unsuspend` | Запустить школу |
| `POST` | `/agent/schools/{slug}/deprovision` | Удалить школу |
| `GET` | `/agent/schools` | Список школ на ноде |
| `GET` | `/agent/health` | Статус ноды (RAM, CPU, disk, schools count) |
| `POST` | `/agent/heartbeat` | Отправить heartbeat в ядро |

**Файлы:**
- `perum-core/app/agent/router.py` — расширить
- `perum-core/app/agent/service.py` — расширить
- `perum-core/app/agent/schemas.py` — новый
- `perum-core/app/services/remote_node_client.py` — новый (HTTP-клиент для агента)
- `perum-core/app/services/school_provisioner.py` — рефакторинг (remote mode)

---

### Этап 3: Capacity Planning & Node Planner (P1, ~4ч)

**Новый сервис `node_planner.py`:**

```python
class NodePlanner:
    SCHOOL_RAM_MB = 192
    SCHOOL_CPU_CORES = 0.15
    SCHOOL_DISK_MB = 500
    NODE_OVERHEAD_RAM_MB = 1024
    NODE_OVERHEAD_CPU = 0.5
    SAFETY_MARGIN = 0.8

    def recommend(school_count: int) -> list[NodeConfig]
    def calculate_capacity(node: Node) -> int
    def find_best_node(org_id: UUID) -> Node | None
    def get_utilization(node: Node) -> NodeUtilization
    def check_limits(org: Organization) -> LimitStatus
```

**Рекомендации по sizing:**

| Нода | CPU | RAM | Disk | Школ (эконом) | Школ (стандарт) |
|------|-----|-----|------|---------------|-----------------|
| S | 2 | 2GB | 20GB | 3 | 5 |
| M | 4 | 4GB | 50GB | 10 | 15 |
| L | 8 | 8GB | 100GB | 25 | 35 |
| XL | 16 | 16GB | 200GB | 50 | 75 |

**API endpoints (routers/nodes.py):**

| Метод | Путь | Описание |
|-------|------|----------|
| `GET` | `/api/platform/nodes` | Список всех нод |
| `POST` | `/api/platform/nodes` | Зарегистрировать ноду |
| `GET` | `/api/platform/nodes/{id}` | Детали ноды |
| `PATCH` | `/api/platform/nodes/{id}` | Обновить |
| `DELETE` | `/api/platform/nodes/{id}` | Decommission |
| `POST` | `/api/platform/nodes/{id}/drain` | Drain |
| `GET` | `/api/platform/nodes/{id}/schools` | Школы на ноде |
| `POST` | `/api/platform/nodes/{id}/bootstrap-script` | Сгенерировать скрипт |
| `GET` | `/api/platform/capacity/recommendation` | Рекомендации |
| `GET` | `/api/org/nodes` | Ноды организации |

**Файлы:**
- `perum-core/app/services/node_planner.py` — новый
- `perum-core/app/routers/nodes.py` — новый
- `perum-core/app/main.py` — регистрация роутера

---

### Этап 4: Скрипты развёртывания нод (P1, ~4ч)

**Шаблон `deploy/scripts/node-bootstrap.sh.tmpl`:**

```bash
#!/usr/bin/env bash
set -euo pipefail
# PERUM Node Bootstrap — {{ node_name }}
# Organization: {{ org_slug }}
# Generated: {{ generated_at }}

# 1. System check (Ubuntu 22.04+, 2GB+ RAM)
# 2. Install Docker CE + Compose v2
# 3. Configure UFW (allow 80, 443, SSH)
# 4. Create /opt/perum-node/
# 5. Write docker-compose.yml
# 6. Write .env with enrollment credentials
# 7. Pull images from GHCR
# 8. docker compose up -d
# 9. Wait for agent health
# 10. Enrollment handshake
# 11. Verify connection
# 12. Print success
```

**Файлы:**
- `deploy/scripts/node-bootstrap.sh.tmpl` — шаблон
- `perum-core/app/services/node_bootstrap.py` — генератор

---

### Этап 5: Тарифные лимиты — enforcement (P1, ~3ч)

**Интеграция:**
- `routers/schools.py` → проверка `max_schools` при создании
- `routers/schools.py` → проверка `max_custom_domains` при добавлении домена
- `services/billing.py` → `check_org_limits()`

**Файлы:**
- `perum-core/app/routers/schools.py` — изменить
- `perum-core/app/services/billing.py` — изменить

---

### Этап 6: OTA-прозрачность (P2, ~3ч)

**Рефакторинг `update_school`:**
- Записывать `UpdateHistory` при каждом обновлении
- Отслеживать статус: pending → success/failed/rolled_back

**Новые endpoints:**

| Метод | Путь | Описание |
|-------|------|----------|
| `GET` | `/api/org/schools/{id}/update-history` | История обновлений |
| `GET` | `/api/org/releases/current` | Текущая версия |
| `GET` | `/api/org/releases/available` | Доступные обновления |
| `POST` | `/api/org/schools/update-all` | Обновить все школы |

**Файлы:**
- `perum-core/app/services/school_provisioner.py` — изменить
- `perum-core/app/routers/schools.py` — добавить endpoints

---

### Этап 7: UI-дашборды (P2, ~10ч)

**7.1. Platform Admin — `/platform/infrastructure`**

```
perum-web/src/app/platform/infrastructure/
  page.tsx
  _components/
    NodesList.tsx          — таблица нод
    CapacityAdvisor.tsx    — рекомендации
    NodeDetail.tsx         — модальное окно ноды
    BootstrapWizard.tsx    — генерация скрипта
    OrgLimitsOverview.tsx  — лимиты организаций
```

**7.2. Org Admin — `/org/infrastructure`**

```
perum-web/src/app/org/infrastructure/
  page.tsx
  _components/
    MyNodes.tsx        — карточки нод
    SchoolsMap.tsx     — школа → нода → домен
    PlanLimits.tsx     — прогресс-бары лимитов
    UpdatePanel.tsx    — обновления
    UpdateHistory.tsx  — история обновлений
```

**7.3. API Client**

Расширить `perum-web/src/lib/apiClient.ts`:
- `getNodes()`, `getNode(id)`, `createNode()`
- `generateBootstrapScript(id)`
- `getCapacityRecommendation(schoolCount)`
- `getOrgNodes()`, `getOrgLimits()`
- `getUpdateHistory(schoolId)`, `updateAllSchools()`

---

### Этап 8: Документация (P2, ~4ч)

| Файл | Содержание |
|------|------------|
| `docs/INFRASTRUCTURE.md` | Архитектура нод, capacity, распределение, мониторинг |
| `docs/NODE_DEPLOYMENT.md` | Пошаговое руководство развёртывания ноды |
| `docs/OTA_UPDATES.md` | OTA для ядра и организаций, rollback, история |
| `docs/TARIFFS_AND_LIMITS.md` | Тарифы, лимиты, enforcement |
| `docs/DOMAIN_MANAGEMENT.md` | Обновить: поддомены, домены, лендинги, тарифы |

---

## 4. Сводная таблица файлов

| # | Файл | Действие | Этап |
|---|------|----------|------|
| 1 | `perum-core/app/models.py` | Изменить | 1 |
| 2 | `perum-core/app/migrations/versions/0015_add_nodes.py` | Новый | 1 |
| 3 | `perum-core/app/migrations/versions/0016_add_plan_limits.py` | Новый | 1 |
| 4 | `perum-core/app/migrations/versions/0017_add_update_history.py` | Новый | 1 |
| 5 | `perum-core/app/schemas/node.py` | Новый | 1 |
| 6 | `perum-core/app/agent/router.py` | Изменить | 2 |
| 7 | `perum-core/app/agent/service.py` | Изменить | 2 |
| 8 | `perum-core/app/agent/schemas.py` | Новый | 2 |
| 9 | `perum-core/app/services/remote_node_client.py` | Новый | 2 |
| 10 | `perum-core/app/services/school_provisioner.py` | Изменить | 2, 6 |
| 11 | `perum-core/app/services/node_planner.py` | Новый | 3 |
| 12 | `perum-core/app/routers/nodes.py` | Новый | 3 |
| 13 | `perum-core/app/main.py` | Изменить | 3 |
| 14 | `deploy/scripts/node-bootstrap.sh.tmpl` | Новый | 4 |
| 15 | `perum-core/app/services/node_bootstrap.py` | Новый | 4 |
| 16 | `perum-core/app/routers/schools.py` | Изменить | 5, 6 |
| 17 | `perum-core/app/services/billing.py` | Изменить | 5 |
| 18 | `perum-web/src/app/platform/infrastructure/` | Новая директория | 7 |
| 19 | `perum-web/src/app/org/infrastructure/` | Новая директория | 7 |
| 20 | `perum-web/src/lib/apiClient.ts` | Изменить | 7 |
| 21 | `perum-web/src/types/index.ts` | Изменить | 7 |
| 22 | `docs/INFRASTRUCTURE.md` | Новый | 8 |
| 23 | `docs/NODE_DEPLOYMENT.md` | Новый | 8 |
| 24 | `docs/OTA_UPDATES.md` | Новый | 8 |
| 25 | `docs/TARIFFS_AND_LIMITS.md` | Новый | 8 |
| 26 | `docs/DOMAINS.md` | Обновить | 8 |

**Итого: ~26 файловых операций, ~35 часов работы.**

---

## 5. Порядок реализации

| Приоритет | Этап | Зависимости | Оценка |
|-----------|------|-------------|--------|
| **P0** | 1. Модели данных | — | 3ч |
| **P0** | 2. Agent API | Этап 1 | 4ч |
| **P1** | 3. Capacity Planning | Этап 1 | 4ч |
| **P1** | 4. Скрипты развёртывания | Этап 1, 3 | 4ч |
| **P1** | 5. Тарифные лимиты | Этап 1 | 3ч |
| **P2** | 6. OTA-прозрачность | Этап 1 | 3ч |
| **P2** | 7. UI-дашборды | Этап 1-6 | 10ч |
| **P2** | 8. Документация | Этап 1-7 | 4ч |
