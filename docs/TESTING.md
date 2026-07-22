# Проверки

## JavaScript и контракты

Из корня после `npm ci`:

```bash
npm run typecheck
npm run test:shared
npm run contracts:check
npm run typecheck:web
npm run build:web
npm run typecheck --workspace perum-mobile
npm test --workspace perum-mobile
npm run validate:config --workspace perum-mobile
npm run export:android --workspace perum-mobile
npm run export:ios --workspace perum-mobile
```

Native support admin reply durability проверяется общим mobile suite в
`perum-mobile/src/support/adminReplyOutbox.test.ts`: admin-only endpoint, immutable
message identity/body, capability pause, bounded retry, FIFO per ticket и account
cleanup. Backend exact replay/mismatch regression находится в
`perum-tenant/tests/unit/test_support.py`.

Shared role boundary между Web и Mobile проверяется domain workspace suite:

```bash
npm test --workspace @perum/domain
```

`packages/domain/test/roles.test.ts` фиксирует, что school support operator —
только `school_admin`/`director`, а общий legacy school-admin helper продолжает
включать `admin`. Общий `npm run test:shared` обязан запускать этот suite.

Friends Web/Mobile используют generated Tenant schemas `StudentProfile`,
`StudentPage`, `FriendRequestOut` и `BlockOut`. `npm run contracts:check`
проверяет, что `/api/social/students` и `/api/social/friends` возвращают
`StudentPage`, request/block list привязаны к своим item schemas, обязательные
client fields не исчезли, а `next_cursor` остаётся required nullable integer.
После изменения social schemas обязательны оба client typecheck и Web build.

Homework read и versioned state receipt проверяются focused backend suite и
contract gate:

```bash
cd perum-tenant
python -m pytest tests/unit/test_homework_semantics.py -q
```

`npm run contracts:check` фиксирует `HomeworkListOut` для `GET /api/homework` и
`HomeworkStateOut` для `PUT /api/homework/{homework_id}/state`, включая required
`status`, `version`, `completed_at`, `homework_id` и `replayed`. Mobile test
`perum-mobile/src/homework/types.test.ts` проверяет fail-closed student decoder:
role-shaped row с `student_state=null` не попадает в student UI.

Organization reply in-app notification routing проверяется тем же focused suite:

```bash
cd perum-tenant
python -m pytest tests/unit/test_support.py -q
```

Suite проверяет same-school active school admin/director fan-out, exclusion
inactive/foreign/requester recipients, replay deduplication, typed admin ticket
reference и operator-scoped read lifecycle.

Web clickable routing дополнительно проверяется strict typecheck и production
build. `/admin?section=school-support&ticket=<public_id>` должен открыть ticket
authoritative GET независимо от первой страницы inbox; unknown notification
references не должны запускать navigation.

Mobile clickable in-app routing проверяется общим mobile suite, включая
`perum-mobile/src/notifications/core.test.ts`. Resolver разрешает только exact
`admin_support_ticket` при capability `support_admin` для `school_admin` и
`director`; неизвестный reference, пустой ticket id, другая роль или выключенная
capability не запускают navigation. Экран использует account-scoped persisted
React Query cache, подтверждает owner-scoped read до перехода и при ошибке не
удаляет unread record. `npm run contracts:check` дополнительно фиксирует typed
`NotificationListOut`/`NotificationOut` с `ref_type` и `ref_id` в Tenant OpenAPI.
Push delivery и tap lifecycle этим тестом не покрываются и готовыми не считаются.

Native support admin read durability проверяется в
`perum-mobile/src/support/adminReadOutbox.test.ts`: admin-only endpoint, exact
observation dedup, immutable action identity, capability pause, transport retry,
permanent failure/explicit retry и account isolation. Клиент не сравнивает opaque
message IDs; server monotonic cursor покрыт Tenant support regression.

`npm run typecheck` уже запускает workspace typechecks. Отдельные команды выше
полезны для воспроизведения конкретного CI job.

## Backend

```bash
(cd perum-core && python -m pytest -q)
(cd perum-tenant && python -m pytest tests/unit -q)
```

Tenant CI также проверяет один Alembic head, SQLite migration smoke и focused
academic suites. Точные команды всегда сверяются с `.github/workflows/ci.yml`.

Occurrence backfill ambiguity acknowledgement:

```bash
cd perum-tenant
python -m pytest tests/unit/test_occurrence_backfill.py -q
```

Friends request identity/concurrency gate:

```bash
cd perum-tenant
python -m pytest tests/unit/test_social_friends.py -q
TEST_POSTGRES_URL=postgresql+asyncpg://... python -m pytest tests/integration/test_social_friends_postgresql.py -q
```

PostgreSQL test использует disposable database и проверяет same-direction,
reverse-direction normalized-pair contention и concurrent reuse одного
`client_request_id` для разных targets. Локальный зелёный прогон не заменяет
named CI evidence; CI выполняет этот файл в существующем PostgreSQL 15 job.

Focused suite проверяет safe-only writes, обязательный/устаревший ambiguity token,
plan change conflict, metadata conflict и отсутствие автоматического guess.

Scanner PostgreSQL integration gate не имеет SQLite fallback и требует только
disposable test database:

```bash
cd perum-tenant
TEST_POSTGRES_URL='postgresql+asyncpg://<disposable-test-db>' \
  python -m pytest tests/integration/test_scanner_postgresql.py -q
```

CI поднимает `postgres:15-alpine` с локальными одноразовыми credentials. Тест
сбрасывает `public` schema, поэтому его запрещено направлять на shared/staging/
production DB. Migration downgrade удаляет scanner lease/evidence metadata и не
является production rollback strategy.

Первый полный зелёный evidence run: `29691375244`; scanner job завершился
`2 passed`. Этот результат доказывает PostgreSQL migration/concurrency contract,
но не заменяет real Docker/ClamAV/EICAR/network pilot.

## CI

`ci.yml` выполняет core/tenant tests, shared/web/mobile checks, production web
build, mobile exports и OpenAPI generation/drift. `release.yml` запускается для
успешного CI commit и не заменяет тестовый workflow.

Stage F lifecycle evidence находится в `perum-mobile/src/auth/trafficCore.test.ts`
и `api.test.ts`; release contract воспроизводится через
`perum-core/tests/test_release_manifest.py`. Named CI gate обязателен до Tenant
image/release publication.

`npm run contracts:generate` автоматически использует service `.venv` локально,
если он существует; в clean CI использует `python` из `PATH`. Явные
`TENANT_PYTHON`/`CORE_PYTHON` поддерживают absolute или repository-relative paths.

Инфраструктурные скрипты `deploy/tests/isolation_e2e.sh` и
`deploy/tests/load_test.js` требуют подготовленный стенд и не входят в обычный
локальный unit cycle.
