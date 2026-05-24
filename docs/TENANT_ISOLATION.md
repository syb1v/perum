# Tenant Isolation: главный инвариант системы

> Этот документ описывает, **что именно** обеспечивает изоляцию между организациями, **как** это проверяется в коде, и **что разработчику нельзя делать** под угрозой нарушения инварианта.

## Что было не так в старой версии

Старый PERUM (`/home/sybiv/Рабочий стол/PERUM`) реализует multi-tenancy через колонку `school_id` в 25+ таблицах. Утилиты `app/utils/tenant.py` (`is_system_admin`, `ensure_tenant_access`, `ensure_same_school`) проверяют принадлежность сущности школе. Это **row-level tenancy** — самый дешёвый и самый хрупкий вид изоляции.

Хрупкость подтверждена аудитами `docs/AUDIT_2026-04-17.md`, `docs/AUDIT_2026-04-26.md`:

- IDOR в `GET /grades/{grade_id}` (`crud_journal.get_grade_by_id` не фильтрует по `school_id`).
- IDOR в `app/market/repository.py:get_item_by_id`.
- IDOR в `app/crud/crud_school.py:91-98` (`get_teacher_subjects_by_subject`).
- «Осиротевшие записи» с `school_id IS NULL` создаются регулярно (диагностируется в `update.sh:82-100`).
- WebSocket валидирует только `user_id`, не проверяет `school_id` при ретрансляции событий.

Корень проблемы: **изоляция была вежливой просьбой**, а не инвариантом. Любой забытый `WHERE school_id = ?` в любом из 175 эндпоинтов = утечка.

## Что обеспечивает изоляцию теперь

Новая модель — **silo-per-organization**:

1. **Один процесс на организацию.** `org_acme_app` и `org_xyz_app` — два разных Docker-контейнера. Они не делят память, не делят connection pool, не имеют общего kernel state кроме того что даёт Linux.
2. **Одна БД на организацию.** `org_acme_db` и `org_xyz_db` — два разных Postgres-контейнера со своими data volumes. У `org_acme_app` нет credentials для `org_xyz_db`. SQL-запрос из `org_acme_app` к таблице `users` физически не может вернуть строку из `org_xyz`.
3. **Сетевая изоляция.** Все стеки живут в общей docker-сети `perum_internal`, но `org_acme_app` не знает hostname `org_xyz_db`. Даже если узнает — credentials у него нет.
4. **JWT привязан к org.** Токен подписан общим `SECRET_KEY`, но payload содержит `org_slug`. Tenant app на старте читает `ORG_SLUG` из ENV (через `perum-tenant/app/core/config.py`) и в auth-middleware отклоняет JWT с `payload.org_slug != settings.ORG_SLUG` (401 Unauthorized).
5. **Tenant identity нельзя поменять во время выполнения.** `ORG_SLUG` — read-only после старта процесса. Эндпоинта «сменить org_slug» не существует.

## Уровни изоляции (что от чего защищает)

| Уровень | Реализация | От чего защищает |
|---|---|---|
| **Между организациями** | Разные процессы + разные БД + сетевая изоляция + JWT-org-binding | IDOR, утечка через забытый фильтр, эскалация админа одной орг до данных другой, эксплойт в SQLAlchemy ORM |
| **Между школами одной орг** | Row-level через `school_id` + `ensure_same_school` utility | IDOR между школами одной орг — здесь риск тот же что в старом PERUM, но scope меньше (только школы одного владельца) |
| **Между ролями внутри школы** | RBAC dependencies (`require_teacher`, `require_school_admin`, ...) + check ownership | Учитель не выставляет оценку чужому ученику, родитель не редактирует профиль ребёнка, и т.д. |

## Правила для разработчика

### Что МОЖНО

- В `perum-tenant` свободно делать SQL-запросы без `WHERE org_id = ?`. Org_id — это process identity, он уже зафиксирован на уровне всего инстанса.
- В roвом коде брать `school_id` из контекста пользователя (`current_user.school_id`) или явного параметра. Утилиты в `perum-tenant/app/core/tenant.py` (когда будут добавлены в Phase 5) помогут проверять `ensure_same_school(user, entity.school_id)`.
- В `perum-core` обращаться к `perum_control_db` напрямую. Это control plane, у него нет данных школ.

### Что НЕЛЬЗЯ

- **Не делать прямых SQL-соединений из `perum-core` в `org_*_db`.** Сидинг и создание org_admin при провижининге — только через HTTP RPC к `org_*_app` или `docker exec`. Это гарантирует, что бизнес-инварианты валидируются tenant-приложением.
- **Не передавать `org_slug` как параметр запроса.** Org определяется hostname (Caddy → upstream → process identity). Если эндпоинт принимает `org_slug` — это архитектурный bug.
- **Не использовать `SECRET_KEY` для подписи cross-org токенов.** JWT-аудитория — конкретная организация. Если нужны кросс-org действия (например, platform_admin делает что-то) — это идёт через control plane API, а не через tenant API.
- **Не открывать в Caddy маршруты по wildcard на чужие upstream.** Один Caddy route = одна org. Никаких regex-маршрутов с динамическим upstream без явной валидации.
- **Не делать background tasks в одном процессе, которые читают данные нескольких орг.** Если control plane хочет агрегировать метрики — он опрашивает каждый `org_*_app` отдельно через telemetry endpoint.

### Чек-лист при добавлении нового модуля в `perum-tenant`

1. Все модели имеют `school_id NOT NULL` FK на `schools.id` (для row-level изоляции внутри орг).
2. Все SELECT-запросы либо стартуют с `school_id` пользователя, либо используют `ensure_same_school` после fetch'a.
3. Все INSERT берут `school_id` из контекста (`current_user.school_id` или из связанной сущности типа `Class.school_id`).
4. UPDATE/DELETE проверяют `ensure_same_school` ДО самой операции.
5. RBAC dependency в роутере соответствует требуемой роли (`require_org_admin`, `require_school_admin`, `require_teacher`, ...).
6. В тестах есть E2E проверка: попытка обращения к чужой школе внутри своей орг → 404.

## Verification

E2E тесты в `perum-tenant/tests/e2e/isolation/` будут проверять (когда появятся в Phase 2 и далее):

```python
def test_cross_org_token_rejected():
    # JWT выдан в acme, отправляется в xyz
    token = login("acme", "admin", "...")
    resp = client_xyz.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 401
    assert "different organization" in resp.json()["detail"]

def test_cross_school_inside_org_returns_404():
    # Teacher из школы #1 запрашивает Grade из школы #2 той же орг
    grade_in_school_2 = create_grade_in_school(school_id=2)
    resp = client.get(f"/api/grades/{grade_in_school_2.id}",
                      headers={"Authorization": f"Bearer {teacher_school_1_token}"})
    assert resp.status_code == 404

def test_no_db_connection_to_other_org():
    # Проверка инфраструктурная: из org_acme_app нет сетевого пути к org_xyz_db
    # (запускается на CI с docker-network setup)
    ...
```

Полная матрица isolation-тестов формируется в Phase 10.

## Если что-то пошло не так

При подозрении на утечку:

1. Проверить логи `org_*_app` за период инцидента — есть ли запросы с неожиданным `org_slug` в JWT.
2. Проверить Caddy access logs — был ли запрос на неожиданный upstream.
3. Проверить, что `ORG_SLUG` в ENV контейнера совпадает с тем, к чему привязан JWT.
4. Если найдена реальная утечка — немедленно изолировать `org_*_app` (`docker stop`), снять `pg_dump`, провести forensic analysis.

Логи каждого org-стека помечены тегом `org_slug` (см. `deploy/scripts/setup-logging.sh`, появится в Phase 9) для быстрой фильтрации.
