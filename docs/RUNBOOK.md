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
Школа доступна на `gimnazia5.<домен>`. Удаление: `DELETE /api/schools/{id}?purge=true`.

## 5. Релиз и обновление «по кнопке» (OTA)

```bash
# platform_admin публикует релиз
curl -X POST $A/api/releases -H "Authorization: Bearer $T" \
  -d '{"version_tag":"2.1.0","image":"<registry>/perum-tenant:2.1.0","changelog":"..."}'
# org_admin видит обновление и жмёт кнопку (или API):
curl $A/api/schools/{id}/update-status -H "Authorization: Bearer $O"   # update_available?
curl -X POST $A/api/schools/{id}/update -H "Authorization: Bearer $O"  # pull + recreate app, том цел
```
При сбое обновления — автоматический откат на прежний образ; данные сохраняются
(пересоздаётся только app-контейнер, БД/том не трогаются).

## 6. Бэкап / восстановление школы

```bash
# бэкап БД школы
docker exec school_<slug>_db pg_dump -U perum perum | gzip > school_<slug>_$(date +%F).sql.gz
# восстановление: остановить app, восстановить БД, alembic upgrade head, запустить app
```

## 7. Диагностика
- `docker ps` — стеки `school_<slug>_app/_db` (healthy).
- Маршруты Caddy восстанавливаются на старте ядра (`_sync_caddy_routes`).
- Логи: `docker logs school_<slug>_app`, `docker logs perum_core`.
