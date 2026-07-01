# RUNBOOK — эксплуатация PERUM v2 («узел организации»)

Операционные процедуры. Архитектура — [ARCH_ORG_NODE.md](ARCH_ORG_NODE.md),
роли — [ROLES.md](ROLES.md). Подразумевается `IMAGE_REGISTRY=mirror.gcr.io` (РФ).

## 1. Поднять ядро (главный сервер)

```bash
echo "127.0.0.1 admin.perum.local" | sudo tee -a /etc/hosts   # dev
IMAGE_REGISTRY=mirror.gcr.io docker compose -f deploy/docker-compose.core.yml up -d --build
docker exec perum_core alembic upgrade head                  # миграции control-БД
curl http://admin.perum.local/health                         # {"status":"ok"}
```
Прод: `deploy/caddy/Caddyfile.prod` (auto-HTTPS), `PERUM_BASE_DOMAIN`, `ACME_EMAIL`.

## 2. Завести организацию + её администратора (platform_admin)

```bash
T=$(curl -s -X POST $A/api/auth/login -d '{"login":"admin","password":"<...>"}' | jq -r .access_token)
curl -X POST $A/api/organizations -H "Authorization: Bearer $T" \
  -d '{"slug":"acme","name":"Acme"}'
curl -X POST $A/api/organizations/acme/org-admins -H "Authorization: Bearer $T" \
  -d '{"login":"orgadmin_acme","password":"<...>","full_name":"Организатор"}'
```

## 3. Подключить узел организации (новый сервер, из коробки)

```bash
# в ядре: одноразовый токен
curl -X POST $A/api/organizations/acme/enrollment-token -H "Authorization: Bearer $T"
# на сервере орг: см. deploy/org-node/README.md
CORE_URL=https://<core> ENROLLMENT_TOKEN=<token> docker compose -f deploy/org-node/docker-compose.yml up -d
```
Проверка: `GET /api/agent/whoami` → `role=org_agent, enrolled=true, org_slug=acme`.
На одном хосте агент = ядро — отдельный узел не нужен.

## 4. Школы (org_admin, портал `admin.*/platform/org` или API)

```bash
O=$(curl -s -X POST $A/api/auth/login -d '{"login":"orgadmin_acme","password":"<...>"}' | jq -r .access_token)
curl -X POST $A/api/schools -H "Authorization: Bearer $O" \
  -d '{"slug":"gimnazia5","name":"Гимназия №5","admin_email":"director@g5.ru"}'
# → поднимается стек school_gimnazia5_*, в ответе одноразовый пароль school_admin
```
Школа доступна на `gimnazia5.<домен>`. Удаление: `DELETE /api/schools/{id}?purge=true&confirm=<slug>`
(purge требует `?confirm=<slug>`; перед сносом томов бэкапятся БД И вложения — при сбое бэкапа тома НЕ удаляются).

## 5. Релиз и обновление «по кнопке» (OTA)

Полный поток — [RELEASING.md](RELEASING.md). Коротко: релиз тенанта регистрирует
**CI** при реальном изменении `perum-tenant/**` (`POST /api/ci/release` с
`RELEASE_PUBLISH_TOKEN`), привязывая релиз к коммиту (`source_commit`); образ
тегируется по git-SHA. «Пустой» OTA (тот же образ/коммит, что текущий) ядро
**отклоняет** (409) — обновить «без изменения кода» нельзя.

```bash
# (резерв) ручная публикация релиза platform_admin — обычно делает CI:
curl -X POST $A/api/releases -H "Authorization: Bearer $T" \
  -d '{"version_tag":"git-<sha>","image":"ghcr.io/<owner>/perum-tenant:git-<sha>","changelog":"...","source_commit":"<sha>"}'
# org_admin видит обновление + changelog и жмёт кнопку (или API):
curl $A/api/schools/{id}/update-status -H "Authorization: Bearer $O"   # update_available?, changelog
curl -X POST $A/api/schools/{id}/update -H "Authorization: Bearer $O"  # 202 + фоновая задача, том цел
```
Обновление идёт **в фоне** (#1): статус школы `updating → active/failed`, орг-консоль
поллит. При сбое — автоматический откат на прежний образ; данные сохраняются
(пересоздаётся только app-контейнер, БД/том не трогаются).

## 6. Бэкап / восстановление школы

```bash
# бэкап БД школы
docker exec school_<slug>_db pg_dump -U perum perum | gzip > school_<slug>_$(date +%F).sql.gz
# восстановление: остановить app, восстановить БД, alembic upgrade head, запустить app
```

## 7. CI/CD и релизы образов

Подробности и таблица настроек GitHub→ядро — [RELEASING.md](RELEASING.md).

- **CI** (`.github/workflows/ci.yml`): на push/PR в `main` — `pytest` ядра,
  `pytest tests/unit` тенанта, `tsc --noEmit` фронта. Ничего не публикует.
- **Release** (`.github/workflows/release.yml`): на push в `main` `paths-filter`
  определяет изменения и собирает+пушит в GHCR **только изменённые** образы
  (`perum-core`/`perum-tenant`/`perum-web`) с тегами `git-<sha>` и `latest` →
  три сервиса релизятся независимо.
- При изменении `perum-tenant/**` CI дополнительно строит **changelog** из `git log`
  и регистрирует релиз в ядре: `POST /api/ci/release` (если заданы переменная
  `CORE_URL` и секрет `RELEASE_PUBLISH_TOKEN`; тот же токен — в `deploy/.env.prod`,
  иначе эндпоинт = 503).
- **Выкат новой версии школ:**
  1. Смержить изменения `perum-tenant/**` в `main` → CI соберёт образ и
     зарегистрирует релиз (с привязкой к коммиту).
  2. `org_admin` жмёт «Обновить» в портале → OTA (см. §5).
- Прод-окружение — `deploy/.env.prod.example` (образы из GHCR, секреты сгенерировать).

## 8. Диагностика
- `docker ps` — стеки `school_<slug>_app/_db` (healthy), `docker_proxy` (фильтрующий
  прокси к docker-демону).
- Ядро **не** монтирует `/var/run/docker.sock` — ходит к демону через сервис
  `docker_proxy` по `DOCKER_HOST=tcp://docker_proxy:2375` (#7). Если стеки школ не
  поднимаются — проверь `docker logs docker_proxy` и доступность сокета у прокси.
- Маршруты Caddy восстанавливаются на старте ядра (`_sync_caddy_routes`), включая
  maintenance-503 для замороженных (приостановленных биллингом) школ.
- Логи: `docker logs school_<slug>_app`, `docker logs perum_core`, `docker logs docker_proxy`.

---

## Обновление 2026-06-13

- **Релизы/OTA — новый поток (§5, §7, [RELEASING.md](RELEASING.md)):** CI собирает в
  GHCR только изменённые образы (`paths-filter`, тег `git-<sha>`), три сервиса
  релизятся независимо. Релиз тенанта регистрирует CI через `POST /api/ci/release`
  (секрет `RELEASE_PUBLISH_TOKEN` в GitHub и в `deploy/.env.prod`; иначе 503), с
  авто-changelog из `git log`. Релиз привязан к коммиту (`source_commit`, миграция
  0014); «пустой» OTA (тот же образ/коммит) отклоняется (409). Ченджлоги видны в
  консоли ядра (таблица релизов) и орг (баннер «Доступно обновление»).
- **Провижининг/обновление школ — асинхронные (#1):** create/reprovision/update →
  `202` + фоновая задача под school-локом; орг-консоль поллит статус. Пароль
  school_admin в ответе create НЕ возвращается — выдаётся через «Админы» → сбросить
  пароль.
- **Удаление (§4):** purge школы/орг требует `?confirm=<slug>`; перед сносом томов
  бэкапятся БД (pg_dump) и вложения (appdata tar, валидация gzip) — при сбое бэкапа
  тома не удаляются.
- **docker_proxy (#7, §8):** ядро больше не монтирует docker.sock напрямую — сокет
  (RO) только у `docker_proxy` (tecnativa/docker-socket-proxy, фильтр API), ядро
  ходит к демону по `DOCKER_HOST`.
- **Биллинг:** авто-enforce по расписанию (фоновая петля, `BILLING_ENFORCE_INTERVAL_S`);
  дебиторка — `GET /api/billing/receivables`; приостановленная орг — read-only биллинг
  (`GET /api/org/billing`); понижение плана ниже использования блокируется (`?force=true`).
  Caddy держит maintenance-503 для замороженных школ.
- **Изоляция токенов (#6):** `internal_rpc_token` отделён от telemetry-токена
  (миграция 0013); тенант с заданным `INTERNAL_RPC_TOKEN` принимает на `/internal`
  только его (constant-time сравнение).
- **Миграции control-БД** доходят до **0014**. Аудит иерархии ядро→орг→школа закрыт —
  см. [AUDIT_2026-06-12.md](AUDIT_2026-06-12.md).
