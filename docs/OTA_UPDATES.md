# OTA-обновления PERUM

> Последнее обновление: 2026-06-18

---

## Обзор

PERUM использует **OTA (Over-The-Air) обновления** для доставки новых версий:
- **Ядро (perum-core)** — ручной деплой platform_admin'ом
- **Tenant (perum-tenant)** — opt-in обновление org_admin'ом

Обновления **volume-preserving** — данные школ сохраняются.

---

## Обновление ядра

### Процесс

1. **CI собирает образ** при push в `main`:
   - `.github/workflows/release.yml` → build → push в GHCR
   - Регистрация релиза через `/api/ci/releases`

2. **Platform admin деплоит вручную**:
   ```bash
    ssh root@87.232.119.17
   cd /opt/perum
   docker compose pull
   docker compose up -d
   ```

3. **Автоматические миграции**:
   - `alembic upgrade head` при старте контейнера
   - Откат при failure (контейнер не стартует)

### Rollback ядра

```bash
# Откатить на предыдущую версию
docker compose down
docker tag ghcr.io/perum/perum-core:previous ghcr.io/perum/perum-core:latest
docker compose up -d
```

---

## Обновление tenant (школ)

### Архитектура

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Platform   │────▶│   Release   │────▶│    Agent    │
│    Admin    │     │   Channel   │     │   (Node)    │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                               │
                                               ▼
                                        ┌─────────────┐
                                        │   School    │
                                        │   Stack     │
                                        └─────────────┘
```

### Release Channel

**Таблица `releases`:**

| Поле | Описание |
|------|----------|
| `channel` | `stable` (пока единственный) |
| `version_tag` | Версия (e.g., `0.0.42`) |
| `image` | Docker image (e.g., `ghcr.io/perum/perum-tenant:0.0.42`) |
| `changelog` | Описание изменений |
| `source_commit` | Git SHA (привязка к реальному коммиту) |
| `is_current` | Текущий активный релиз |

**Публикация релиза:**
- CI: `POST /api/ci/releases` с `RELEASE_PUBLISH_TOKEN`
- Guard: `source_commit` обязателен (нельзя выпустить OTA без реального изменения)

### Процесс обновления школы

1. **Org admin видит доступные обновления**:
   - UI: `/org/infrastructure` → "Available Updates"
   - API: `GET /api/schools/releases/available`

2. **Org admin нажимает "Обновить"**:
   - UI: кнопка в карточке школы
   - API: `POST /api/schools/{id}/update`

3. **Агент выполняет обновление**:
   ```
   a. Pull нового образа
   b. Backup текущего контейнера (tag)
   c. Stop старого app-контейнера
   d. Create нового app-контейнера (volume сохраняется)
   e. Run alembic migrations
   f. Health check
   g. Если OK → удалить старый контейнер
   h. Если FAIL → rollback на старый контейнер
   ```

4. **Запись в историю**:
   - `update_history` таблица
   - Статус: `success`, `failed`, `rolled_back`

### Автоматический rollback

Если обновление не удалось:
1. Агент пытается откатить на предыдущий образ
2. Если rollback тоже failed → школа в статусе `failed`
3. Org admin видит ошибку в истории обновлений
4. Platform admin может вмешаться вручную

### Массовое обновление

**Обновить все школы организации:**

```bash
curl -X POST https://admin.perum.ru/api/org/schools/update-all \
  -H "Authorization: Bearer <org_token>"
```

Агент обновляет школы последовательно, записывая историю для каждой.

---

## История обновлений

### API

```bash
# История обновлений школы
GET /api/schools/{id}/update-history?limit=20

# Текущий релиз
GET /api/schools/releases/current

# Доступные обновления
GET /api/schools/releases/available
```

### Таблица `update_history`

| Поле | Описание |
|------|----------|
| `school_id` | ID школы |
| `from_version` | Откуда обновлялись |
| `to_version` | Куда обновились |
| `status` | `pending`, `success`, `failed`, `rolled_back` |
| `started_at`, `completed_at` | Тайминг |
| `error_message` | Если failed |

---

## Best Practices

### Перед обновлением

1. **Проверить changelog** — что изменилось, есть ли breaking changes
2. **Убедиться, что есть бэкапы** — автоматические бэкапы перед OTA
3. **Обновлять в off-peak** — минимизировать downtime для пользователей

### После обновления

1. **Проверить health** — `GET /agent/health` на ноде
2. **Проверить логи** — `docker compose logs school_<slug>_app`
3. **Проверить функциональность** — зайти в школу, проверить основные операции

### Rollback

Если обновление сломало функциональность:

1. **Не паниковать** — автоматический rollback уже сработал (если был возможен)
2. **Проверить статус** — `update_history` покажет `rolled_back` или `failed`
3. **Связаться с поддержкой** — если rollback не сработал

---

## Troubleshooting

### Обновление зависло

**Симптом:** школа в статусе `updating` > 10 минут

**Решение:**
```bash
# На ноде: проверить логи
docker compose logs school_<slug>_app

# Перезапустить агента
docker compose restart perum_agent

# Принудительно откатить (если нужно)
docker stop school_<slug>_app
docker rm school_<slug>_app
docker run -d --name school_<slug>_app \
  -v school_<slug>_data:/data \
  ghcr.io/perum/perum-tenant:<old_version>
```

### Rollback не сработал

**Симптом:** школа в статусе `failed`, старый контейнер не стартует

**Решение:**
1. Проверить volume: `docker volume inspect school_<slug>_data`
2. Восстановить из бэкапа (если есть)
3. Обратиться к platform admin

---

## Связанные документы

- [INFRASTRUCTURE.md](INFRASTRUCTURE.md) — архитектура
- [NODE_DEPLOYMENT.md](NODE_DEPLOYMENT.md) — развёртывание ноды
- [RELEASING.md](RELEASING.md) — процесс релизов
