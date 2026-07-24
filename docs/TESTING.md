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

Teacher classes response проверяется focused backend suite и contract gate:

```bash
(cd perum-tenant && python -m pytest tests/unit/test_teacher_contracts.py -q)
npm run contracts:check
npm run typecheck:web
```

Pydantic suite фиксирует nullable `created_at` и запрет extra envelope fields.
Contract gate проверяет `TeacherClassesOut` binding, `TeacherClassOut` item schema,
required fields и nullable `date-time`; Web typecheck гарантирует использование
generated response без ручного cast.

Тот же focused suite проверяет teacher homework profile feed. Curated gate
фиксирует `TeacherHomeworkListOut`/`TeacherHomeworkOut`, все required item fields,
nullable `date-time` и nullable class/subject names. Web typecheck и build обязаны
подтвердить явную обработку отсутствующих metadata без возврата к ручному DTO.

Teacher works contract в том же suite покрывает homework/control items, empty page,
required nullable names/description/date strings, exact type literals и invalid/
extra-field rejection. Curated gate фиксирует response/item refs, nullable surface
и pagination boolean; Web typecheck/build подтверждают generated JSON cast, но не
raw-fetch/auth/error, ordering или infinite-scroll behavior.

Teacher diary contract в focused teacher suite покрывает nested nullable schedule,
homework attachment metadata, required occurrence state и rejection missing/extra/
unknown status/stale `group_name`. Curated gate фиксирует response/day/lesson/
homework/control refs, status literals, required nullable fields и date formats;
Web typecheck/build подтверждают generated DTO в dashboard и journal schedule без
claims о navigation, modal, cache или occurrence lifecycle behavior.

Teacher homeroom contract в том же suite покрывает assigned/unassigned states,
nullable class/student names, stats и rejection missing/extra/invalid enrollment.
Curated gate фиксирует response и nested refs, nullable class branch и literal
`active`; Web typecheck/build подтверждают generated GET DTO, но не bulk-balance
request/receipt, selection или refresh behavior.

Journal work types contract проверяется отдельно:

```bash
(cd perum-tenant && python -m pytest tests/unit/test_journal_contracts.py -q)
npm run contracts:check
npm run typecheck:web
```

Focused suite фиксирует полный и пустой response, required `weight`, non-null поля
и запрет extra envelope/item data. Curated gate проверяет
`JournalWorkTypesOut`/`JournalWorkTypeOut` binding, а Web typecheck сохраняет один
generated transport DTO во всех четырёх journal consumer-ах.

Тот же journal contract suite проверяет nested teacher class-subject picker:
пустые class/subject lists, required nullable `grade_level`/`short_name`, required
non-null identifiers/names/category и запрет extra data на каждом уровне. Curated
gate фиксирует оба item refs и nullability; Web typecheck/build покрывают журнал,
аналитику, темы и структурно суженные picker props без casts.

Topics read contract в том же suite проверяет полный и пустой GET envelope,
required non-null `id`/`name`/`order_num`, missing/null поля и rejection ложных
`subject_id`/`description`/extra data. GET binding проверяется отдельно от
mutation bindings; четыре read consumer-а используют один generated DTO.

Topics create/update contract tests проверяют, что `TopicCreate`/`TopicUpdate`
принимают только required non-null `name`, а общий `JournalTopicOut` остаётся
closed. Curated gate фиксирует POST/PUT request и response refs; Web typecheck
подтверждает generated payload/result на management page без claims об archive,
restore, concurrency или offline replay.

Topic archive/restore receipts проверяются focused journal contract и academic
archiving suites: exact `detail="ok"`, противоположные literal `is_archived`,
missing/wrong/extra-field rejection, soft archive, parent-subject `409` и restore
visibility. Curated gate защищает оба response refs, отсутствие request body и
restore path presence; Web typecheck покрывает generated archive response, но не
restore UI, versioning, idempotency или offline flow.

Active periods contract проверяется focused common suite:

```bash
(cd perum-tenant && python -m pytest tests/unit/test_common_contracts.py -q)
npm run contracts:check
npm run typecheck:web
```

Suite покрывает current/null/empty responses, ISO date parsing, missing/nullable и
extra fields. Curated gate фиксирует `ActivePeriodsOut`/`ActivePeriodOut` refs,
required nullable `current_period` и date formats; Web typecheck сохраняет generated
analytics query DTO без проверки selection policy или admin CRUD.

Teacher analytics topics contract имеет отдельный focused suite:

```bash
(cd perum-tenant && python -m pytest tests/unit/test_analytics_contracts.py tests/unit/test_analytics_period.py -q)
npm run contracts:check
npm run typecheck:web
```

Suite покрывает полный/пустой envelope, exact required non-null topic fields,
missing/null/extra rejection. Curated gate фиксирует response/item refs и closed
schemas; Web typecheck/build подтверждают generated DTO в page/report generator,
но не dashboard/problem-students/works, query semantics или report rendering.

Тот же analytics contract suite покрывает dashboard: class/period/KPI, populated
и empty nested lists, missing/null/extra rejection на envelope и nested schemas.
Curated gate фиксирует dashboard response ref и exact refs period/KPI/dynamics/
problem topics/attention students; Web typecheck/build подтверждают generated
aliases во всех analytics components без claims о polling, charts, report output
или problem-students/works endpoints.

Problem-students contract в том же suite покрывает full/empty envelope, required
counts/boolean/string issues и missing/null/extra rejection. Curated gate фиксирует
response/item refs и string item type для `issues`; Web typecheck/build гарантируют
отсутствие `any[]` в report request, но не проверяют thresholds/sorting или
отображение `issues` в старом столбце `reason`.

Lesson occurrence receipt проверяется journal contract и existing occurrence suites:

```bash
(cd perum-tenant && python -m pytest tests/unit/test_journal_contracts.py tests/unit/test_lesson_occurrences.py -q)
npm run contracts:check
npm run typecheck:web
```

Contract suite фиксирует exact seven-field receipt, lifecycle literals, required
nullable `topic_id`, date/slot/version bounds и closed object. Existing service
suite сохраняет optimistic-lock и transfer behavior; Web использует server status
и version, но error DTO, cache и Mobile flow этим не покрываются.

Journal grade detail проверяется тем же focused contract suite: полный и
attendance-only nullable payload, nested subject/student, `date`/`date-time`,
positive version, missing и extra fields. Curated gate фиксирует exact required
surface, nullable branches и nested refs; Web typecheck подтверждает generated
detail DTO и server `points`, но не grade mutations или общий journal grid.

Grade update receipt в том же suite проверяет обычный и attendance-only result,
required nullable grade/color, positive version, points/diff/balance и closed
surface. Curated gate фиксирует PUT `UpdateGradeRequest` и
`JournalGradeUpdateOut`; Web typecheck покрывает typed payload/receipt, но не
conflict envelope, local receipt application, create/delete или offline flow.

Grade create receipt contract tests покрывают grade и attendance-only result,
required nullable grade/color/attendance, exact eight-field closed surface и
missing/extra fields. Curated gate фиксирует POST `AddGradeRequest` optionality и
`JournalGradeCreateOut`; Web typecheck подтверждает generated payload/receipt без
claims о create version, delete, calculations, idempotency или offline replay.

Grade delete receipt проверяется тем же focused contract suite: required non-null
boolean `success`, string `message`, missing/null/extra-field rejection. Curated
gate фиксирует DELETE `JournalGradeDeleteOut`, отсутствие request body и required
integer query `version`; Web typecheck подтверждает generated response. Tenant
unit suite, shared suites и production Web build сохраняют текущую delete/refund и
refresh behavior, но не доказывают multi-device conflict или offline semantics.

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

Social moderation privacy contract проверяется focused suite:

```bash
cd perum-tenant
python -m pytest tests/unit/test_social_moderation_retention.py -q
```

Suite валидирует Pydantic-модели на router-shaped whitelist payload, а не на ORM
row: inbox содержит только summary/version/timestamps, detail отдельно раскрывает
evidence с opaque participant label и nullable body, action receipt возвращает
новую optimistic `version`. `npm run contracts:check` фиксирует bindings трёх
admin moderation endpoints, required fields и nullable integer inbox cursor.

Mobile social query invalidation contract проверяется в
`perum-mobile/src/query/queryKeys.test.ts` и `src/realtime/core.test.ts` общим
mobile suite. Reconnect, `message.created`, conversation read/change и durable
send/read success используют `socialInvalidationKeys`; все keys обязаны начинаться
с exact account namespace и не затрагивать support, admin-support или Homework.
Read-success plan обязан включать unread query, чтобы offline cursor replay не
оставлял stale badge.

Тот же `perum-mobile/src/query/queryKeys.test.ts` проверяет раздельные requester и
admin support plans. Requester keys обязаны оставаться в `support` без admin unread;
operator keys — в `support-admin`, action/conflict/reply/read должны обновлять
admin unread, а thread допускается только для reply. Все plans account-scoped;
используется TanStack prefix invalidation tickets family вместо дублирования detail key.

Cross-component support delivery telemetry contract находится в
`fixtures/contracts/support_escalation_delivery.v1.json`. Tenant
`test_collect_metrics.py` проверяет exporter against accepted fixture и exact
four-field allowlist; Core `test_telemetry_stats.py` прогоняет те же accepted и
rejected examples через strict parser/status rollup. Extra fields, включая
`school_id`, обязаны возвращать unknown (`None` внутри parser), а не игнорироваться.
Fixture должен оставаться без school/user/host identifiers.

Whole school metrics persistence contract находится в
`fixtures/contracts/school_metrics.v1.json`. Tenant `test_collect_metrics.py`
сверяет exporter scalar/section keys, Core `test_deployment_snapshot.py` — sanitizer
allowlists и фактический persisted payload. Unknown top-level identifier/content
должен отбрасываться; nested section с extra/missing key, boolean вместо count,
negative или non-finite number не должен сохраняться. HTTP heartbeat compatibility
сохраняется: malformed optional section не отклоняет весь authenticated request.

Deployment snapshot producer/consumer contract находится в
`fixtures/contracts/deployment_snapshot.v1.json`. Tenant `test_telemetry.py`
сверяет emitted exact fields/readiness/generation, Core
`test_deployment_snapshot.py` валидирует тот же accepted payload и rejected schema
version, integer-as-bool, negative generation, naive timestamp и extra field.
Fixture synthetic: он не закрывает operator Mobile ledger export, deliberate
rollback или Stage F pilot evidence.

Preferences contract gate проверяет GET/PATCH `/api/user/preferences`, PATCH
request `PreferencesPatch`, response `PreferencesResponse` и required поля обеих
schemas. Mobile provider использует generated request/response aliases, а Tenant
route suite сохраняет idempotency, ETag и conflict semantics:

```bash
npm run contracts:check
npm run typecheck --workspace perum-mobile
(cd perum-tenant && python -m pytest tests/unit/test_user_preferences.py -q)
```

Push registration contract gate проверяет GET status, PUT registration и DELETE
revoke response schemas, PUT request и required fields. Mobile pure test фиксирует
восстановление UI state из nullable server registration receipt и отдельно
подтверждает, что registration не доказывает delivery readiness:

```bash
npm run contracts:check
npm test --workspace perum-mobile
(cd perum-tenant && python -m pytest tests/unit/test_push.py -q)
```

Эти проверки не заменяют physical-device delivery/tap/cold-start evidence.

Social mutation contract gate проверяет request bindings для message send, read
cursor и report. Mobile mapper test фиксирует перенос immutable outbox identities,
а Tenant suites сохраняют idempotency, cursor и moderation semantics:

```bash
npm run contracts:check
npm test --workspace perum-mobile
(cd perum-tenant && python -m pytest tests/unit/test_social_messages.py tests/unit/test_social_moderation_retention.py -q)
```

Requester support mutation gate проверяет ticket creation, reply и read request
bindings. Mobile mapper test фиксирует stable ticket/message/read identities;
Tenant suite дополнительно сохраняет compatibility Web reads без action ID:

```bash
npm run contracts:check
npm test --workspace perum-mobile
(cd perum-tenant && python -m pytest tests/unit/test_support.py -q)
```

Admin support mutation gate проверяет metadata PATCH, assignment, operator reply
и read request bindings. Existing Mobile admin core/outbox tests фиксируют
generated metadata literals, expected version, stable action identity, endpoint
separation, conflict и retry semantics:

```bash
npm run contracts:check
npm test --workspace perum-mobile
(cd perum-tenant && python -m pytest tests/unit/test_support.py -q)
```

Native escalation request и Core terminal delivery receipts этим не покрываются.

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
