# Deployment

> Документ описывает, как раскатать новую версию tenant-образа и control plane. Подробности появятся по мере прохождения фаз.

## Что есть сейчас (Phase 0)

Каркас и документация. Деплоить нечего — нет ни тестов, ни production кода.

Локальный dev-стенд в `deploy/docker-compose.core.yml` (Phase 1):

```bash
docker compose -f deploy/docker-compose.core.yml up -d --build
```

### Docker registry mirror (обязательно в РФ)

С середины 2024 Docker Hub (`registry-1.docker.io`) троттлится/блокируется российскими провайдерами: TLS-handshake проходит, но скачивание слоёв обрывается с `EOF`. Базовые образы (`postgres`, `redis`, `caddy`) не вытягиваются. Это касается и dev-машины, и прод-Ubuntu.

Фикс — зеркало реестра в `/etc/docker/daemon.json`. Проверенный рабочий вариант — `mirror.gcr.io` (Google pull-through cache, не режется в РФ):

```bash
sudo tee /etc/docker/daemon.json > /dev/null <<'EOF'
{
  "registry-mirrors": [
    "https://mirror.gcr.io",
    "https://dockerhub.timeweb.cloud",
    "https://huecker.io"
  ]
}
EOF
sudo systemctl restart docker
```

`registry-mirrors` применяется только к образам Docker Hub (`docker.io/library/*`) — а все наши базовые образы именно оттуда. Наш собственный `perum-core:dev` собирается локально (`pull_policy: build` в compose), мимо реестра.

Поднимет:
- `perum_core` (control plane, FastAPI)
- `perum_control_db` (Postgres для control plane)
- `caddy` (central reverse-proxy)
- `shared_redis`

Тестовая орг создаётся через CLI:

```bash
docker exec perum_core python -m app.cli create-org \
  --slug=acme --name="Acme Education" --admin-email=a@a.ru
```

## Релиз новой версии tenant (когда будет)

Tenant-образ собирается через GitHub Actions при merge в `main`. Image push в GHCR с тегами `latest` и `${{ github.sha }}`.

Раскатывание на прод (через perum-core):

```bash
curl -X POST https://admin.perum.ru/api/rollout \
  -H "Authorization: Bearer $PLATFORM_TOKEN" \
  -d '{"new_version": "ghcr.io/syb1v/perum-tenant:abc1234", "canary_percent": 10}'
```

Control plane:
1. Pull нового образа.
2. На canary_percent орг — `compose up -d` с новым образом (recreate).
3. Ожидание healthcheck.
4. Применение Alembic-миграций.
5. Если canary прошёл успешно (нет ошибок 30 минут) — раскатать на остальные.
6. При проблемах — rollback на предыдущий тег.

## Релиз control plane

Control plane обновляется через стандартный `docker compose up -d` после `docker compose pull`:

```bash
cd /opt/perum
docker compose -f deploy/docker-compose.core.yml pull perum_core
docker compose -f deploy/docker-compose.core.yml up -d perum_core
docker compose -f deploy/docker-compose.core.yml exec perum_core alembic upgrade head
```

В будущем — автоматизировано через GitHub Actions при push в `main`.

## Rollback

### Tenant

`POST /api/rollout` с предыдущей версией tenant-образа. Control plane перезапустит все стеки на старом образе. Миграции БД — отдельно (см. ниже).

### Control plane

```bash
docker compose -f deploy/docker-compose.core.yml pull perum_core --version=<previous_sha>
docker compose -f deploy/docker-compose.core.yml up -d perum_core
```

## Миграции БД и rollback

Alembic-миграции в `perum-tenant/migrations/` применяются автоматически при provisioning новой орг (см. [PROVISIONING.md](PROVISIONING.md)) и при rolling-обновлении версии tenant.

**Rollback миграции — особый случай:** если новая версия добавляет колонку, а старая её не использует — обычный downgrade работает. Если новая удаляет колонку, к которой обращается старая версия — downgrade сломает запросы. Поэтому правило:

- Каждая миграция должна быть **forward-compatible**: новая версия кода работает и на старой схеме (на время раскатывания).
- Удаление колонок — отдельным релизом, через 1 версию после того, как кода-перестало-обращаться-к-ней.

Это правило взято из `docs/AUDIT_2026-04-26.md` старого PERUM (раздел «Правила работы»).

## Бэкапы

(Phase 9.) Ежедневный `pg_dump` каждого `org_*_db`:

```bash
deploy/scripts/backup-org.sh acme  # выгрузит org_acme в /backups/org_acme/$(date).sql.gz
```

Retention: 30 дней локально, S3-archive на 12 месяцев. Бэкап control plane аналогично.

## Восстановление одной орг

(Phase 9.)

```bash
deploy/scripts/restore-org.sh acme 2026-04-15.sql.gz
# - останавливает org_acme_app
# - восстанавливает org_acme_db из бэкапа
# - применяет head-миграции (на случай если БД старее текущей версии)
# - запускает org_acme_app
```

## Что появляется на каждой фазе

- **Phase 0:** документ.
- **Phase 1:** `deploy/docker-compose.core.yml`, базовый запуск контрольной плоскости.
- **Phase 7-8:** CI/CD pipeline в `.github/workflows/`.
- **Phase 9:** скрипты бэкапа/восстановления, rollback automation.
- **Phase 11:** прод-деплой и runbook.
