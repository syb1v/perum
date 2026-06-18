# Прогресс реализации: Инфраструктурное управление PERUM

> План: [INFRASTRUCTURE_PLAN.md](INFRASTRUCTURE_PLAN.md)
> Последнее обновление: 2026-06-18

---

## Общий прогресс

| Этап | Описание | Статус | Прогресс |
|------|----------|--------|----------|
| 1 | Модели данных и миграции | Завершён | 100% |
| 2 | Agent API на ноде | Завершён | 100% |
| 3 | Capacity Planning & Node Planner | Завершён | 100% |
| 4 | Скрипты развёртывания нод | Завершён | 100% |
| 5 | Тарифные лимиты — enforcement | Завершён | 100% |
| 6 | OTA-прозрачность | Завершён | 100% |
| 7 | UI-дашборды | Завершён | 100% |
| 8 | Документация | Завершён | 100% |

---

## Детальный прогресс

### Этап 1: Модели данных и миграции

**Задачи:**
- [x] Добавить модель `Node` в `app/models.py`
- [x] Добавить модель `NodeAssignment` в `app/models.py`
- [x] Добавить модель `UpdateHistory` в `app/models.py`
- [x] Расширить `Organization` (plan_tier, max_schools, max_custom_domains, custom_landing_enabled, max_nodes)
- [x] Создать миграцию `0015_add_nodes.py`
- [x] Создать миграцию `0016_add_plan_limits.py`
- [x] Создать миграцию `0017_add_update_history.py`
- [x] Создать `app/schemas/node.py` (Pydantic-схемы)

**Статус:** Завершён
**Завершено:** 2026-06-18

---

### Этап 2: Agent API на ноде

**Задачи:**
- [x] Расширить `app/agent/router.py` (добавить endpoints школ)
- [x] Расширить `app/agent/service.py` (school lifecycle methods)
- [x] Создать `app/agent/schemas.py`
- [x] Создать `app/services/remote_node_client.py`
- [x] Рефакторинг `app/services/school_provisioner.py` (remote mode)

**Статус:** Завершён
**Завершено:** 2026-06-18

---

### Этап 3: Capacity Planning & Node Planner

**Задачи:**
- [x] Создать `app/services/node_planner.py`
- [x] Создать `app/routers/nodes.py`
- [x] Зарегистрировать роутер в `app/main.py`

**Статус:** Завершён
**Завершено:** 2026-06-18

---

### Этап 4: Скрипты развёртывания нод

**Задачи:**
- [x] Создать `deploy/scripts/node-bootstrap.sh.tmpl`
- [x] Создать `app/services/node_bootstrap.py`

**Статус:** Завершён
**Завершено:** 2026-06-18

---

### Этап 5: Тарифные лимиты — enforcement

**Задачи:**
- [x] Интеграция в `app/routers/schools.py` (проверка max_schools)
- [x] Интеграция в `app/routers/schools.py` (проверка max_custom_domains)
- [x] Добавить `check_org_limits()` в `app/services/billing.py`

**Статус:** Завершён
**Завершено:** 2026-06-18

---

### Этап 6: OTA-прозрачность

**Задачи:**
- [x] Рефакторинг `update_school` (запись UpdateHistory)
- [x] Добавить endpoints истории обновлений
- [x] Добавить endpoint "Обновить все школы"

**Статус:** Завершён
**Завершено:** 2026-06-18

---

### Этап 7: UI-дашборды

**Задачи:**
- [x] Создать `/platform/infrastructure` страницу
- [x] Создать CSS модуль
- [x] Создать `/org/infrastructure` страницу
- [x] Создать CSS модуль
- [x] Создать `lib/infrastructureApi.ts`
- [x] Расширить `types/index.ts`

**Статус:** Завершён
**Завершено:** 2026-06-18

---

### Этап 8: Документация

**Задачи:**
- [x] Создать `docs/INFRASTRUCTURE.md`
- [x] Создать `docs/NODE_DEPLOYMENT.md`
- [x] Создать `docs/OTA_UPDATES.md`
- [x] Создать `docs/TARIFFS_AND_LIMITS.md`
- [x] Обновить `docs/DOMAINS.md`

**Статус:** Завершён
**Завершено:** 2026-06-18

---

## Лог изменений

| Дата | Этап | Изменение |
|------|------|-----------|
| 2026-06-18 | — | Создан план INFRASTRUCTURE_PLAN.md |
| 2026-06-18 | — | Создан файл прогресса PROGRESS_INFRA.md |
| 2026-06-18 | 1 | Начало работы над Этапом 1 |
| 2026-06-18 | 1 | Завершён Этап 1: модели, миграции, схемы |
| 2026-06-18 | 2 | Завершён Этап 2: Agent API, RemoteNodeClient |
| 2026-06-18 | 3 | Завершён Этап 3: NodePlanner, routers/nodes.py |
| 2026-06-18 | 4 | Завершён Этап 4: bootstrap script template + generator |
| 2026-06-18 | 5 | Завершён Этап 5: тарифные лимиты в schools.py и billing.py |
| 2026-06-18 | 6 | Завершён Этап 6: UpdateHistory + endpoints |
| 2026-06-18 | 7 | Завершён Этап 7: UI-дашборды platform + org |
| 2026-06-18 | 8 | Завершён Этап 8: 5 документов |
| 2026-06-18 | — | Все проверки пройдены: tsc --noEmit, pytest |
