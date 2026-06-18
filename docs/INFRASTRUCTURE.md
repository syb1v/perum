# Инфраструктура PERUM

> Последнее обновление: 2026-06-18

---

## Обзор архитектуры

PERUM использует **multi-server архитектуру** с централизованным управлением:

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

---

## Компоненты

### Control Plane (Ядро)

**Сервер:** `94.125.102.167` (или другой прод-сервер)

**Компоненты:**
- `perum_core` — FastAPI приложение (ROLE=platform)
- `perum_control_db` — PostgreSQL (центральная БД)
- `perum_web` — Next.js frontend
- `caddy` — reverse proxy с auto-HTTPS
- `docker_proxy` — безопасный доступ к Docker API
- `prometheus` + `grafana` — мониторинг

**Ответственность:**
- Управление организациями и школами
- Выдача enrollment-токенов для нод
- Capacity planning и рекомендации
- OTA-обновления (release channel)
- Биллинг и тарифные лимиты

### Agent (Нода)

**Компоненты:**
- `perum_agent` — то же приложение perum-core, но с ROLE=org_agent
- `perum_node_db` — локальная PostgreSQL (состояние агента)
- `docker_proxy` — безопасный доступ к Docker API
- `caddy` — reverse proxy для школ на этой ноде

**Ответственность:**
- Enrollment handshake с ядром
- Управление школами на своей ноде (provision/update/suspend/deprovision)
- Heartbeat в ядро (статус, метрики)
- Локальное хранение состояния школ

---

## Модель нод

### Таблица `nodes`

| Поле | Описание |
|------|----------|
| `id` | Уникальный идентификатор |
| `name` | Человекочитаемое имя (e.g., "node-01") |
| `hostname` | IP-адрес или FQDN |
| `cpu_cores`, `ram_gb`, `disk_gb` | Ресурсы сервера |
| `status` | `pending_bootstrap`, `active`, `draining`, `offline`, `decommissioned` |
| `org_id` | Привязка к организации (nullable = пул) |
| `max_schools` | Максимальное кол-во школ |
| `last_heartbeat` | Последний heartbeat от агента |

### Жизненный цикл ноды

```
pending_bootstrap → active → draining → offline → decommissioned
                       ↑         │
                       └─────────┘
```

1. **pending_bootstrap** — нода зарегистрирована, скрипт не скачан
2. **active** — агент подключён, принимает школы
3. **draining** — новые школы не назначаются, существующие мигрируют
4. **offline** — агент недоступен (heartbeat timeout)
5. **decommissioned** — нода выведена из эксплуатации

---

## Распределение школ по нодам

### Алгоритм выбора ноды

При создании школы `NodePlanner.find_best_node()`:

1. Фильтрует ноды: `status = active` AND (`org_id = org.id` OR `org_id IS NULL`)
2. Для каждой ноды считает utilization: `schools_count / max_schools`
3. Выбирает ноду с наибольшим свободным capacity
4. Round-robin при равных условиях

### Capacity Planning

**Ресурсы на одну школу:**
- RAM: 192 MB (128 tenant + 64 postgres)
- CPU: 0.15 cores
- Disk: 500 MB

**Overhead ноды:**
- RAM: 1024 MB (OS + Caddy + agent)
- CPU: 0.5 cores

**Safety margin:** 80% (не загружать выше)

**Рекомендации:**

| Нода | CPU | RAM | Disk | Школ |
|------|-----|-----|------|------|
| S | 2 | 2GB | 20GB | 5 |
| M | 4 | 4GB | 50GB | 15 |
| L | 8 | 8GB | 100GB | 35 |
| XL | 16 | 16GB | 200GB | 75 |

---

## Мониторинг

### Heartbeat

Агент отправляет heartbeat в ядро каждые 60 секунд:
- `schools_count` — кол-во школ на ноде
- `cpu_percent`, `ram_used_mb`, `disk_used_gb` — метрики
- `agent_version` — версия агента

Ядро обновляет `nodes.last_heartbeat`. Если > 5 минут — нода считается `offline`.

### Prometheus метрики

- `perum_schools_total{org, node}` — кол-во школ
- `perum_node_capacity_percent{node}` — утилизация ноды
- `perum_ota_updates_total{status}` — история обновлений

---

## API Reference

### Platform Admin

| Endpoint | Описание |
|----------|----------|
| `GET /api/platform/nodes` | Список всех нод |
| `POST /api/platform/nodes` | Зарегистрировать ноду |
| `GET /api/platform/nodes/{id}` | Детали ноды |
| `PATCH /api/platform/nodes/{id}` | Обновить ноду |
| `DELETE /api/platform/nodes/{id}` | Удалить ноду |
| `POST /api/platform/nodes/{id}/drain` | Перевести в draining |
| `GET /api/platform/nodes/{id}/schools` | Школы на ноде |
| `GET /api/platform/nodes/{id}/utilization` | Утилизация ноды |
| `POST /api/platform/nodes/{id}/bootstrap-script` | Сгенерировать скрипт |
| `GET /api/platform/capacity/recommendation` | Рекомендации |

### Org Admin

| Endpoint | Описание |
|----------|----------|
| `GET /api/org/nodes` | Ноды организации |
| `GET /api/org/nodes/{id}` | Детали ноды |
| `GET /api/org/nodes/{id}/utilization` | Утилизация |

### Agent (на ноде)

| Endpoint | Описание |
|----------|----------|
| `GET /agent/whoami` | Статус агента |
| `GET /agent/health` | Метрики ноды |
| `GET /agent/schools` | Список школ |
| `POST /agent/schools/provision` | Развернуть школу |
| `POST /agent/schools/{slug}/update` | OTA-обновление |
| `POST /agent/schools/{slug}/suspend` | Остановить школу |
| `POST /agent/schools/{slug}/unsuspend` | Запустить школу |
| `POST /agent/schools/{slug}/deprovision` | Удалить школу |
| `POST /agent/heartbeat` | Отправить heartbeat |

---

## Связанные документы

- [NODE_DEPLOYMENT.md](NODE_DEPLOYMENT.md) — развёртывание ноды
- [OTA_UPDATES.md](OTA_UPDATES.md) — обновления
- [TARIFFS_AND_LIMITS.md](TARIFFS_AND_LIMITS.md) — тарифы и лимиты
- [DOMAINS.md](DOMAINS.md) — управление доменами
