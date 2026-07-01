# Deployment

> ⚠️ **Архитектура v2 («узел организации», silo = школа).** Пошаговая эксплуатация
> (поднять ядро, завести орг, подключить узел, провижинить школы, релизы и
> OTA-обновления, бэкапы) — в **[RUNBOOK.md](RUNBOOK.md)**. Топология — в
> [ARCH_ORG_NODE.md](ARCH_ORG_NODE.md). Прод-прокси — `deploy/caddy/Caddyfile.prod`
> (auto-HTTPS + on-demand TLS). Узел орг из коробки — `deploy/org-node/`.
> Раздел ниже — исторический (модель silo = организация), сохранён для контекста.

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

## Обновление tenant-версии — модель «всё по кнопке»

Tenant-образ собирается в GitHub Actions при релизе и пушится в GHCR с
версией-тегом (`ghcr.io/syb1v/perum-tenant:1.2.0`) и `latest`.

**Платформа НЕ катит обновления сама. Модель — pull / opt-in:**

1. **Публикация релиза.** Оператор регистрирует релиз в control plane: версия +
   тег образа + changelog (+ опц. пометка «критичный»).
2. **Уведомление.** Каждая активная орг получает в админке (`org_admin`) баннер
   «доступна версия X» со списком изменений.
3. **Обновление по кнопке.** `org_admin` жмёт «Обновить» → control plane
   обновляет ТОЛЬКО стек этой орг:
   - pull нового tenant-образа;
   - recreate `org_<slug>_app` (БД `org_<slug>_db`, volume и секреты **не трогаются**);
   - `alembic upgrade head` внутри нового контейнера;
   - wait healthy; при провале — автооткат на предыдущий тег.
4. **Независимость.** Каждая орг обновляется в своём темпе. Принудительных и
   авто-обновлений нет — **даже секьюрити-патчи накатываются только по кнопке орг**
   (платформа может лишь пометить релиз критичным и слать напоминания).

Эндпоинт (Phase ~9): `POST /api/organizations/{slug}/update {version}` —
volume-preserving апдейт. Опирается на те же примитивы, что и провижининг
(`docker_client.run_container` + exec alembic), но контейнеры пересоздаются
без удаления volume (`remove_containers`, а не `remove_stack`).

> «Контейнер тянет код» = тянет готовый **образ** из GHCR, не исходники. Сборка —
> на стороне CI; орг лишь перетягивает образ и гонит миграции.

## Multi-host: dedicated_vm (Phase 9)

Для крупных орг на отдельных VM control plane не имеет прямого доступа к их
Docker. Вместо SSH+docker — лёгкий **агент-контейнер** на каждой VM (модель
Remnawave panel↔node): ставится одним bootstrap-скриптом, слушает команды
control plane по защищённому каналу (mTLS/токен) и выполняет provisioning /
update / health локально. На одном хосте (по умолчанию) отдельного агента не
требуется, но и тогда ядро ходит к демону **не напрямую**, а через фильтрующий
сервис `docker_proxy` (см. секцию «Обновление 2026-06-13» / #7) — сырой
`docker.sock` в ядро не монтируется.

## Релиз control plane

Прод-команды compose запускаются из `/opt/perum/deploy` с прод-наложением и
`.env.prod`:

```bash
cd /opt/perum/deploy
docker compose --env-file .env.prod -f docker-compose.core.yml -f docker-compose.prod.yml pull perum_core
# миграции control-БД ДО пересоздания (если есть новые) — схема доходит до 0014:
docker compose --env-file .env.prod -f docker-compose.core.yml -f docker-compose.prod.yml run --rm perum_core alembic upgrade head
docker compose --env-file .env.prod -f docker-compose.core.yml -f docker-compose.prod.yml up -d --force-recreate perum_core
```

CI собирает образы и регистрирует релиз тенанта автоматически на push в `main` —
канон по релизам и обновлению сервисов по отдельности в **[RELEASING.md](RELEASING.md)**.

## Rollback

### Tenant (одна орг)

`POST /api/organizations/{slug}/update` с предыдущим тегом образа — control plane
пересоздаёт стек **этой орг** на старом образе (volume-preserving). Откат
схемы — отдельно (forward-compatible правило ниже делает откат образа безопасным
без отката миграций). Массового отката «всем сразу» нет — всё пер-орг.

### Control plane

Откат на предыдущий образ (`:git-<sha>` из GHCR) — переопределить тег в
`.env.prod` (`CORE_IMAGE`) и пересоздать:

```bash
cd /opt/perum/deploy
docker compose --env-file .env.prod -f docker-compose.core.yml -f docker-compose.prod.yml pull perum_core
docker compose --env-file .env.prod -f docker-compose.core.yml -f docker-compose.prod.yml up -d --force-recreate perum_core
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

## Обновление 2026-06-13

Точечные уточнения под текущее состояние (silo = школа; узел орг управляет
школьными стеками; ядро держит только метаданные).

### Сервис `docker_proxy` — ядро без сырого сокета

Ядро (`perum_core`) **больше не монтирует** `/var/run/docker.sock`. Единственный
сервис с доступом к сокету хоста (смонтирован read-only) — `docker_proxy`
(`tecnativa/docker-socket-proxy`), фильтрующий Docker API (haproxy): ядру открыты
только нужные ручки (containers/images/volumes/networks/exec + POST/version/ping),
а `swarm/secrets/services/system/…` закрыты. Ядро ходит к демону по
`DOCKER_HOST=tcp://docker_proxy:2375` (см. `deploy/docker-compose.core.yml`).
Компрометация ядра больше не даёт прямого root-доступа к демону. На прод-сервере
образ прокси предзагружен (`docker save|load`), pull не требуется
(`pull_policy: missing`). Полный вынос docker-операций в отдельный `org-agent` —
будущий этап мульти-сервера.

### Прод-команды compose

Все compose-команды на прод-сервере — из `/opt/perum/deploy`, с прод-наложением и
`.env.prod`:

```bash
docker compose --env-file .env.prod -f docker-compose.core.yml -f docker-compose.prod.yml <cmd>
```

Базовый домен прод-стенда задаётся в `deploy/.env.prod` (`PUBLIC_BASE_DOMAIN`):
платформа на `admin.<домен>`, школы на `*.<домен>`.

### Миграции control-БД — до 0014

Схема control plane доходит до ревизии **0014** (`0013` — изоляция токенов
`SchoolSecret.internal_rpc_token` от `telemetry_token`; `0014` —
`Release.source_commit` для привязки релиза тенанта к реальному коду). Применять
**до** пересоздания контейнера ядра:

```bash
docker compose --env-file .env.prod -f docker-compose.core.yml -f docker-compose.prod.yml run --rm perum_core alembic upgrade head
```

Миграции tenant-БД (`perum-tenant/migrations/`) — отдельная линия (до tenant-0013),
накатываются при провижининге школы и OTA-обновлении её стека.

### Обновление сервисов по отдельности и публикация релизов

Три сервиса (perum-core, perum-tenant, perum-web) релизятся независимо: CI на push
в `main` (paths-filter) собирает и пушит в GHCR **только изменённые** образы
(`:git-<sha>` + `:latest`) и авто-регистрирует релиз тенанта (по `source_commit`,
с авто-changelog из git log; no-op релиз отклоняется). Канон по релизам,
интегрити и пошаговому обновлению каждого сервиса — **[RELEASING.md](RELEASING.md)**.
Дублировать процедуры здесь не нужно.
