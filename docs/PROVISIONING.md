# Provisioning: как создаётся новая организация

> Документ описывает шаги, которые control plane выполняет при создании новой организации. Реализация — в `perum-core/app/services/tenant_provisioner.py` (появится в Phase 1).

## Триггер

`POST /api/organizations` в perum-core от пользователя с ролью `platform_admin`:

```json
{
  "slug": "acme",
  "name": "Acme Education",
  "admin_email": "ivan@acme.ru",
  "plan": "trial",
  "deployment_mode": "shared_host"
}
```

## Шаги провижининга

### 1. Валидация (синхронно, в обработчике запроса)

- `slug` уникален в `perum_control_db.organizations`.
- `slug` соответствует regex `^[a-z][a-z0-9-]{2,30}$` (для poddomain'а DNS).
- `slug` не в blacklist (admin, www, api, docs, control, …).
- Если `deployment_mode == "dedicated_vm"` — есть свободная VM в пуле (Phase 9).
- Биллинг проверка (Phase 9): план оплачен или trial доступен.

При фейле — 400 Bad Request, ничего не создано.

### 2. Запись организации (синхронно)

В `perum_control_db.organizations`:

```sql
INSERT INTO organizations (slug, name, plan, status, deployment_mode, created_at)
VALUES ('acme', 'Acme Education', 'trial', 'provisioning', 'shared_host', now())
RETURNING id;
```

Статус `provisioning` — означает «работа идёт, не пускать пользователей».

### 3. Генерация секретов

```python
db_password = secrets.token_urlsafe(32)
secret_key = secrets.token_urlsafe(48)
telemetry_token = secrets.token_urlsafe(32)
redis_db_index = next_free_redis_db_index()  # 0..15
```

Секреты сохраняются в `perum_control_db.organization_secrets` (зашифрованы через KMS — Phase 9; на данный момент plain в БД, отметить TODO).

### 4. Рендеринг compose-файла

Шаблон `deploy/stack-templates/org-stack.docker-compose.yml.tmpl` рендерится с подставленными значениями:

```yaml
name: org_acme
services:
  app:
    image: ghcr.io/syb1v/perum-tenant:1.0.0
    container_name: org_acme_app
    environment:
      ORG_SLUG: acme
      ORG_NAME: "Acme Education"
      DATABASE_URL: postgresql://perum:<db_password>@org_acme_db:5432/perum
      REDIS_URL: redis://shared_redis:6379/3
      CONTROL_PLANE_URL: http://perum_core:3000
      TELEMETRY_TOKEN: <token>
      SECRET_KEY: <secret>
    networks:
      - perum_internal
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped

  db:
    image: postgres:15-alpine
    container_name: org_acme_db
    environment:
      POSTGRES_USER: perum
      POSTGRES_PASSWORD: <db_password>
      POSTGRES_DB: perum
    volumes:
      - org_acme_data:/var/lib/postgresql/data
    networks:
      - perum_internal
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U perum"]
      interval: 5s

volumes:
  org_acme_data:

networks:
  perum_internal:
    external: true
```

Результат записывается в `deploy/stacks/org_acme.yml` (gitignored).

### 5. Запуск стека

```python
await docker_client.compose_up(
    file="deploy/stacks/org_acme.yml",
    project_name="org_acme",
    detach=True
)
```

Это эквивалент `docker compose -f deploy/stacks/org_acme.yml -p org_acme up -d` через Docker SDK.

### 6. Ожидание готовности

Цикл healthcheck-проверки:

```python
async def wait_for_healthy(container_name: str, timeout: int = 60):
    for _ in range(timeout):
        status = await docker_client.inspect(container_name)
        if status.health == "healthy":
            return
        await asyncio.sleep(1)
    raise ProvisioningError(f"{container_name} did not become healthy in {timeout}s")
```

Сначала ждём `org_acme_db`, потом `org_acme_app`.

### 7. Применение миграций

```python
await docker_client.exec(
    container="org_acme_app",
    command=["alembic", "upgrade", "head"]
)
```

Внутри tenant-образа лежат все миграции `perum-tenant/migrations/versions/`. На свежей БД они применяются последовательно от пустого состояния до головы.

### 8. Сидинг дефолтных данных

```python
await docker_client.exec(
    container="org_acme_app",
    command=["python", "-m", "app.scripts.seed_defaults"]
)
```

Скрипт `perum-tenant/app/scripts/seed_defaults.py` (появится в Phase 2) создаёт:
- `Organization` запись (одна, мета для этого стека) с `slug=ORG_SLUG`.
- Дефолтные `WorkType` (ответ, домашняя, самостоятельная, контрольная, проект, экзамен) — порт из старого `app/routers/system.py:create_school`.
- Дефолтные `BellSchedule` шаблоны (для разных смен).
- Базовые `Subject` (Математика, Русский, Литература, …) — порт из `scripts/generate_test_data.py:SUBJECTS_DATA`.
- Аватары-заготовки в `ShopItem` (категория avatar).

Школы НЕ создаются автоматически — их создаёт `org_admin` после регистрации.

### 9. Создание org_admin

```python
await tenant_rpc.create_initial_admin(
    container="org_acme_app",
    email=payload.admin_email,
    role="org_admin"
)
```

Через HTTP RPC (внутренний эндпоинт `POST /internal/bootstrap-org-admin` в tenant app, защищён `TELEMETRY_TOKEN`). Создаёт `User` с `role=org_admin`, генерирует временный пароль, возвращает его. Альтернатива — `docker exec` со скриптом, но HTTP RPC лучше для аудита.

### 10. Регистрация маршрута в Caddy

```python
await caddy_admin.add_route(
    host=f"{org.slug}.perum.ru",
    upstream=f"org_{org.slug}_app:3000"
)
```

Через Caddy admin API (`POST http://localhost:2019/load`). Подробнее — [DOMAINS.md](DOMAINS.md).

### 11. Финализация

В `perum_control_db.organizations`:
```sql
UPDATE organizations
SET status = 'active', activated_at = now()
WHERE slug = 'acme';
```

Запись в audit log:
```sql
INSERT INTO audit_log (actor_id, action, entity, entity_id, details, created_at)
VALUES (<platform_admin_id>, 'provision_org', 'organization', <org.id>, '{...}', now());
```

### 12. Отправка инвайта org_admin

Email с временным паролем и URL `https://acme.perum.ru/login` → org_admin меняет пароль при первом входе.

## Откат при ошибке (cleanup)

Если на шаге 4-10 случилась ошибка, control plane выполняет cleanup:

1. `docker compose -p org_acme down -v` (удаляет контейнеры и тома).
2. Caddy route removed.
3. `UPDATE organizations SET status = 'failed' WHERE slug = 'acme'` (вместо `DELETE` — храним для аудита).

Платежи возвращаются (Phase 9).

## Идемпотентность

Если platform_admin повторно вызывает `POST /api/organizations` со slug, который уже в статусе `failed` — provisioner запускается снова, реюзая существующую запись.

Если slug в статусе `active` или `provisioning` — 409 Conflict.

## Что НЕ делается при провижининге

- **Не создаётся DNS-запись для slug.** Это обязанность администратора perum.ru — wildcard `*.perum.ru` уже настроен. Slug автоматически попадает под него.
- **Не создаётся SSL-сертификат для slug.** Wildcard cert для `*.perum.ru` обновляется Caddy через DNS-01 challenge, новый slug сразу под него попадает.
- **Не создаются школы.** Школы создаёт org_admin вручную через org-admin UI после получения инвайта.
- **Не создаются учителя/ученики.** Это после создания школ.

## Что появляется на каждом этапе разработки

- **Phase 1:** шаги 1-7 и 10-11. Без сидинга (8) и создания org_admin (9).
- **Phase 2:** шаги 8 и 9 — нужны для login org_admin'а.
- **Phase 4:** custom domain provisioning (отдельный flow, см. [DOMAINS.md](DOMAINS.md)).
- **Phase 9:** биллинг-валидация на шаге 1, KMS-шифрование секретов на шаге 3, `dedicated_vm` mode.
