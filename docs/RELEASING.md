# Релизы, CI/CD и обновления

Как устроена работа с репозиторием, что и где делает GitHub Actions, как
публиковать **реальные** релизы для тенантов и как обновлять три сервиса —
фронтенд, ядро+орги и тенанты — **по отдельности**.

> Главный инвариант релизов тенанта: **обновление выкатывается ТОЛЬКО при реальном
> изменении кода тенанта.** «Пустой» OTA (тот же образ/коммит, что уже текущий)
> ядро отклоняет — см. [Интегрити релиза](#интегрити-релиза).

---

## 1. Три независимо релизящихся сервиса

| Сервис | Что это | Где крутится | Как обновляется |
|---|---|---|---|
| **perum-web** | Next.js фронтенд (лендинг ядра, консоли платформы/орг, UI школ) | один контейнер `perum_web` на хосте ядра | пересборка образа + пересоздание `perum_web` |
| **perum-core** | Control plane (организации, биллинг, провижининг, релизы) + узлы орг (`ROLE=org_agent`) | `perum_core` на хосте ядра; агенты — на серверах орг | пересборка образа + миграции + пересоздание `perum_core` |
| **perum-tenant** | Образ школьного стека (журнал, оценки, геймификация) | по контейнеру на КАЖДУЮ школу (silo=SCHOOL) | публикация релиза → org_admin жмёт «Обновить» (OTA, volume-preserving) |

Каждый сервис обновляется **отдельно** — см. раздел 5.

---

## 2. Что делает GitHub Actions

Два workflow в `.github/workflows/`:

### `ci.yml` — проверки (на каждый push/PR в `main`)
- **perum-core** — `pytest -q`
- **perum-tenant** — `pytest tests/unit -q`
- **perum-web** — `tsc --noEmit`

Ничего не публикует. Если красный — релиз делать нельзя.

### `release.yml` — сборка образов, авто-деплой control plane и регистрация релиза тенанта (на push в `main` + ручной `workflow_dispatch`)
1. **`changes`** — `dorny/paths-filter` определяет, что РЕАЛЬНО изменилось:
   `perum-core/**`, `perum-web/**`, `perum-tenant/**`. От «пустых» OTA (тот же
   образ/коммит) защищает бэкенд в `publish_release_record`. ⚠️ В фильтре НЕ
   использовать `!`-исключения — у paths-filter OR-семантика, и negation matchит
   почти любой файл → тенант детектится на каждом коммите.
2. **`build`** — собирает и пушит в **GHCR** ТОЛЬКО изменённые образы:
   `ghcr.io/<owner>/<image>:git-<sha>` и `:latest`. Неизменённый сервис не
   пересобирается. → фронт/ядро/тенант релизятся независимо, образ появляется
   лишь при реальном изменении кода.
3. **`deploy`** — авто-деплой **control plane** (ядро + веб) на прод-сервер по SSH:
   выполняется, если изменился `core`/`web` И задана переменная репозитория
   **`DEPLOY_ENABLED=true`**. На сервере: `git pull` → `docker compose pull
   perum_core perum_web` (свежие образы из GHCR) → `up -d` (ядро при старте само
   прогоняет `alembic upgrade head`). Тенант (школы) НЕ трогается — у него opt-in
   OTA. Без `DEPLOY_ENABLED`/секретов job пропускается (текущий прод не ломается).
4. **`tenant-release`** — выполняется ТОЛЬКО если изменился код `perum-tenant/**`:
   - собирает **changelog** из `git log` коммитов, затронувших `perum-tenant/**`;
   - регистрирует релиз в ядре: `POST /api/ci/release` с
     `{version_tag: git-<sha>, image: ghcr.../perum-tenant:git-<sha>, changelog, source_commit}`.

> `tenant-release` срабатывает, только если задана переменная репозитория
> **`CORE_URL`** и секрет **`RELEASE_PUBLISH_TOKEN`** (см. раздел 6). Иначе шаг
> пропускается, а образ всё равно лежит в GHCR — релиз можно опубликовать вручную.

---

## 3. Интегрити релиза

Релиз тенанта = строка в таблице `releases` ядра (`channel`, `version_tag`,
`image`, `source_commit`, `changelog`, `is_current`).

`publish_release_record` (и ручной `POST /api/releases`, и CI `POST /api/ci/release`)
**отклоняет** новый текущий релиз (409), если:
- его `image` совпадает с образом уже текущего релиза, **или**
- его `source_commit` совпадает с коммитом текущего релиза.

Поскольку CI тегирует образ по git-SHA (`git-<sha>`), **одинаковый код → одинаковый
образ/коммит → отклонение.** Так «обновить без реального изменения кода» невозможно
на уровне ядра. Образы тенанта обязаны приходить из CI-сборок (тег по коммиту), а не
выдумываться вручную.

`update_school` дополнительно ничего не делает, если `school.release_tag` уже равен
образу текущего релиза (no-op).

---

## 4. Как организация видит и ставит обновление

- `GET /api/schools/{id}/update-status` отдаёт `latest_version`, `latest_image`,
  `changelog`, `update_available` (`school.release_tag != latest_image`).
- **Орг-консоль** (`/platform/org`, раздел «Школы») показывает баннер
  **«Доступно обновление → версия»** с **ченджлогом**, и кнопку «Обновить» у школы.
- **Ядро-консоль** (`/platform`, раздел «Релизы») показывает все релизы: версию,
  образ, **коммит**, ченджлог, какой текущий.
- Обновление — **opt-in** (по кнопке org_admin), **volume-preserving** (данные
  сохраняются), при сбое — **авто-откат** на прежний образ. Идёт в фоне (#1):
  статус школы `updating → active/failed`, консоль поллит.

---

## 5. Обновить сервис по отдельности

> При включённом `DEPLOY_ENABLED=true` (раздел 6) **ядро и веб обновляются сами**
> на push в `main` — ручные шаги ниже нужны только как резерв или для разовых
> обновлений вне CI. Тенант-школы обновляются всегда вручную (opt-in OTA).

Базовый домен прод-стенда задаётся в `deploy/.env.prod` (`PUBLIC_BASE_DOMAIN`).
Команды compose на сервере: `cd /opt/perum/deploy && docker compose --env-file .env.prod -f docker-compose.core.yml -f docker-compose.prod.yml ...`.

### Фронтенд (perum-web)
`NEXT_PUBLIC_BASE_DOMAIN` **вшивается в билд** → образ доменно-зависимый.
- **Через CI/GHCR:** задать переменную репозитория `PUBLIC_BASE_DOMAIN` = домен
  прода, чтобы CI собрал корректный web-образ; затем на сервере
  `docker pull ghcr.io/<owner>/perum-web:latest && docker tag ... perum-web:dev && docker compose ... up -d --force-recreate perum_web`.
- **Локально (если GHCR недоступен из сети сервера):**
  ```
  docker build -t perum-web:dev --build-arg NEXT_PUBLIC_BASE_DOMAIN=<домен> -f perum-web/Dockerfile perum-web
  docker save perum-web:dev | gzip | ssh root@<сервер> 'docker load'
  ssh root@<сервер> 'cd /opt/perum/deploy && docker compose --env-file .env.prod -f docker-compose.core.yml -f docker-compose.prod.yml up -d --force-recreate perum_web'
  ```

### Ядро + узлы орг (perum-core)
Один и тот же образ работает и как платформа (`ROLE=platform`), и как агент орг
(`ROLE=org_agent`).
1. Собрать образ (CI → GHCR `:git-<sha>`/`:latest`, или локально `docker build -t perum-core:dev -f perum-core/Dockerfile perum-core`).
2. Доставить на хост(ы) (`docker pull` из GHCR **или** `docker save|ssh docker load`).
3. **Миграции control-БД ДО пересоздания** (если есть новые):
   `docker compose --env-file .env.prod -f ... run --rm perum_core alembic upgrade head`.
4. `docker compose --env-file .env.prod -f ... up -d --force-recreate perum_core`.

> Ядро не монтирует docker.sock напрямую — ходит к демону через сервис
> `docker_proxy` (см. [DEPLOYMENT.md](DEPLOYMENT.md) / [ARCH_ORG_NODE.md](ARCH_ORG_NODE.md), #7).

### Тенанты (perum-tenant) — это и есть «реальный релиз»
1. Изменить код в `perum-tenant/**`, смержить в `main`.
2. CI (`release.yml`) сам соберёт `ghcr.io/<owner>/perum-tenant:git-<sha>`, соберёт
   changelog и (если настроены `CORE_URL`+`RELEASE_PUBLISH_TOKEN`) зарегистрирует
   релиз в ядре.
3. Образ должен быть доступен хосту школ: либо GHCR pullable, либо предзагружен
   (`docker save|load`). На текущем прод-стенде сервер тянет из реестров сам.
4. org_admin жмёт «Обновить» у школ → OTA.

**Ручная публикация релиза тенанта** (резерв, если CI-регистрация не настроена):
`POST /api/releases` (platform_admin) `{version_tag, image, changelog, source_commit}`.
Ядро отклонит, если образ совпадает с текущим.

---

## 6. Настройка автоматизации (GitHub → ядро)

| Где | Имя | Тип | Назначение |
|---|---|---|---|
| GitHub repo → Variables | `PUBLIC_BASE_DOMAIN` | variable | домен прода для билда web-образа |
| GitHub repo → Variables | `CORE_URL` | variable | базовый URL ядра (напр. `https://admin.<домен>`); включает шаг регистрации релиза |
| GitHub repo → Secrets | `RELEASE_PUBLISH_TOKEN` | secret | bearer-токен CI-публикации релиза |
| Прод `deploy/.env.prod` | `RELEASE_PUBLISH_TOKEN` | env | тот же токен на стороне ядра (иначе `/api/ci/release` = 503) |
| GitHub repo → Variables | `DEPLOY_ENABLED` | variable | `true` — включает job `deploy` (авто-деплой ядра+веба на прод) |
| GitHub repo → Variables | `DEPLOY_PATH` | variable | путь к репо на сервере (по умолчанию `/opt/perum`) |
| GitHub repo → Secrets | `DEPLOY_SSH_HOST` | secret | хост прод-сервера для SSH-деплоя |
| GitHub repo → Secrets | `DEPLOY_SSH_USER` | secret | пользователь SSH (напр. `root`) |
| GitHub repo → Secrets | `DEPLOY_SSH_KEY` | secret | приватный SSH-ключ (с доступом к серверу) |
| GitHub repo → Secrets | `DEPLOY_SSH_PORT` | secret | порт SSH (опц., по умолчанию `22`) |

Сгенерировать токен: `python -c "import secrets; print(secrets.token_urlsafe(32))"`,
положить одинаковое значение в секрет GitHub и в `.env.prod`, пересоздать `perum_core`.

**Включить авто-деплой control plane:** на сервере репо должно лежать в `DEPLOY_PATH`
(дефолт `/opt/perum`) с настроенным `deploy/.env.prod` (образы `CORE_IMAGE`/`WEB_IMAGE`
= GHCR `:latest`, `*_PULL_POLICY=always`). Завести deploy-ключ (`ssh-keygen`), публичную
часть — в `~/.ssh/authorized_keys` сервера, приватную — в секрет `DEPLOY_SSH_KEY`. Задать
`DEPLOY_ENABLED=true`. После этого push в `main`, меняющий `perum-core/**` или
`perum-web/**`, сам выкатит свежий control plane (тенант-школы остаются на opt-in OTA).

---

## 7. Версионирование и журнал

- Образы — `git-<sha>` (контентная привязка). Человекочитаемые версии — в
  [CHANGELOG.md](../CHANGELOG.md) и [VERSIONS.md](VERSIONS.md).
- Ченджлог релиза тенанта формируется автоматически из commit-сообщений, затронувших
  `perum-tenant/**` — пишите осмысленные сообщения коммитов.

См. также: [DEPLOYMENT.md](DEPLOYMENT.md), [RUNBOOK.md](RUNBOOK.md), [ARCH_ORG_NODE.md](ARCH_ORG_NODE.md).
