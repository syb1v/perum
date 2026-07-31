# API-контракты

Core и Tenant публикуют разные OpenAPI surfaces. Version-controlled snapshots и
generated TypeScript находятся в `packages/api-schema/`:

- `openapi/core.json`;
- `openapi/tenant.json`;
- `generated/core.ts`;
- `generated/tenant.ts`;
- `contracts.json` — curated operation set.

## Обновление

После изменения FastAPI route/schema из корня:

```bash
npm run contracts:generate
npm run contracts:check
```

Generator выбирает `perum-tenant/.venv/bin/python` и
`perum-core/.venv/bin/python` локально при их наличии; clean CI использует
установленный `python` из `PATH`. Overrides `TENANT_PYTHON` и `CORE_PYTHON`
разрешаются как absolute или repository-relative executable paths.

Просмотрите generated diff вместе с backend изменением. CI повторно генерирует
контракты, требует clean diff и запускает curated contract check.

`@perum/api-client` предоставляет platform-neutral transport. Web и mobile могут
добавлять environment adapters, но не должны вручную расходиться с generated
request/response types. Anonymous mobile discovery и tenant descriptor имеют
дополнительный structural parity gate, описанный в
[DYNAMIC_MOBILE_DESCRIPTOR_PLAN.md](DYNAMIC_MOBILE_DESCRIPTOR_PLAN.md).

Mobile preferences являются curated contract: GET/PATCH
`/api/user/preferences` обязаны возвращать `PreferencesResponse`, PATCH принимает
`PreferencesPatch`, а их required fields проверяет `contracts:check`. Runtime
outbox state остаётся локальным типом и не должен добавляться в OpenAPI schema.

Push registration также является curated contract: GET status, PUT registration
receipt и DELETE revoke receipt имеют отдельные schemas, PUT принимает
`RegistrationPut`. Nullable `PushRegistrationStatusOut.registration` является
authoritative признаком активной регистрации; `delivery_enabled` отдельно остаётся
false до появления реального provider adapter и credentials.

Social mutation requests являются curated contract: POST message принимает social
`MessageCreate`, read cursor — social `ReadCreate`, report — `ReportCreate`.
Mobile durable outbox mapper обязан переносить server-facing stable client identity
из локальной записи без генерации нового ID во время retry.

Requester support mutation requests также curated: ticket creation использует
`TicketCreate`, reply — support `MessageCreate`, read cursor — support `ReadCreate`.
`client_action_id` в read schema намеренно optional для существующих Web consumers,
но Mobile durable mapper обязан отправлять его при каждом replay.

Admin support mutation requests curated отдельно: metadata PATCH использует
`TicketPatch`, assignment POST — `AssignCreate`, operator reply/read переиспользуют
support `MessageCreate`/`ReadCreate`. Mobile action union должен брать допустимые
status/category/priority values из generated patch schema, а не из `string`.

Teacher classes read также является curated contract: GET `/api/teacher/classes`
обязан возвращать `TeacherClassesOut` с `TeacherClassOut[]`. Все item fields
required, а `created_at` остаётся nullable `date-time`; Web использует generated
response и не должен поддерживать отдельную копию wire DTO.

Teacher profile homework feed использует отдельный curated contract для GET
`/api/teacher/homework`: `TeacherHomeworkListOut` содержит
`TeacherHomeworkOut[]`. Это компактная projection, не `HomeworkListOut` от
`/api/homework`; `created_at`, `class_name` и `subject_name` required nullable,
тогда как `description` всегда нормализован в строку.

Teacher works GET `/api/teacher/works` возвращает closed `TeacherWorksOut` с
required `works` и `has_more`. `TeacherWorkOut` требует composite string ID,
literal `homework|control`, class/subject IDs, title и required nullable names,
description, due/created date strings. Contract не меняет raw-fetch/auth/error,
filters, ordering, offset pagination или infinite-scroll merge.

Teacher diary GET `/api/teacher/diary` возвращает closed `TeacherDiaryOut` с
required teacher/week fields и string-keyed map `TeacherDiaryDayOut`. Nested lesson
всегда содержит class/subject, required nullable names/room/bell times, homework,
control work и occurrence ID/status/version; homework attachments и nullable
metadata имеют отдельные closed schemas. Contract не определяет week navigation,
modal behavior, cache или occurrence lifecycle.

Teacher homeroom GET `/api/teacher/my-class` возвращает closed
`TeacherHomeroomOut`: required `has_class`, nullable `class`, student list и stats.
Class/student/stats имеют отдельные closed schemas; student names required nullable,
enrollment status фиксирован literal `active`. Contract не распространяется на
POST bulk-balance, selection или refresh lifecycle.

Parent analytics read family включает GET children, child grades summary, period
analytics и transactions. `ParentChildrenOut`/`ParentTransactionsOut` закрывают
parent-owned projections; parent и student summary/analytics routes используют
одни `GradesSummaryOut`/`GradesAnalyticsOut`. Period dates имеют `date-time`, map
averages nullable, current period required nullable. Family не включает parent
diary/grades/finals, mutations или UI request lifecycle.

Student inventory read slice использует отдельный GET
`/api/student/inventory/recent`, не legacy market endpoint. Closed root list
`StudentInventoryOut` ограничен 50 `StudentInventoryItemOut`; item содержит только
stable inventory `id`, item `name`/`item_type`/`rarity`, `quantity`, `equipped` и
`purchased_at` date-time. Повторные покупки остаются отдельными inventory rows.
Image/storage path, item ID, delivery/issue, price/stock, admin и upgrade fields не
входят в curated contract; equip/purchase/delivery mutations им не определяются.
Home availability probe намеренно выполняет тот же bounded GET максимум на 50 closed
rows и переиспользует результат в memory-only account query, а не получает отдельную
availability metadata. Новый availability endpoint или descriptor key не добавляется, чтобы old
Tenant в rolling deployment определялся по exact generic router
`404 {"detail":"Not Found"}`; прочие 404 не означают отсутствие feature.

School Admin class schedule read использует отдельный GET
`/api/admin/classes/{class_id}/schedule/read`, не меняя legacy Web GET/PUT
`/api/admin/classes/{class_id}/schedule`. Closed `AdminClassScheduleReadOut`
содержит только neutral `class_name` и exact six-day map; каждый closed
`AdminClassScheduleReadLessonOut` требует `lesson_number` и nullable
`subject_display`, `teacher_display`, `room`. Schedule/class/subject/teacher IDs,
groups, roster, bell time и actions не входят в contract. Endpoint использует
existing `school_admin_class_directory` capability: новый descriptor key не
добавляется. Rolling old Tenant определяется только по exact generic router
`404 {"detail":"Not Found"}`; domain `Класс не найден` и malformed 404 не
означают отсутствие feature. OpenAPI описывает `schedule` как string-keyed map на
`AdminClassScheduleReadDayOut` и не может выразить exact keys/order: producer
validator server-enforced требует ровно ключи `0..5`, `lesson_number` integer
`1..8` и строго возрастающие уникальные номера внутри каждого дня. Blank active
teacher получает neutral `Учитель` без ID fallback.

Journal work types являются отдельным curated reference-data contract: GET
`/api/journal/work-types` возвращает `JournalWorkTypesOut` с
`JournalWorkTypeOut[]`. Envelope `success`/`work_types` и item `id`/`name`/`weight`
обязательны и non-null; Web journal consumers используют generated response вместо
локальных сокращённых shapes.

Journal teacher picker также curated: GET `/api/journal/teacher/subjects`
возвращает `JournalTeacherSubjectsOut` с nested `JournalTeacherClassOut` и
`JournalTeacherSubjectOut`. Все keys required; `grade_level` и `short_name`
nullable, class/subject arrays non-null. Этот DTO нельзя подменять `ClassInfo` или
`Subject`, потому что их legacy domain fields не совпадают с wire projection.

Journal topics GET является отдельным curated read contract:
`/api/journal/subjects/{subject_id}/topics` возвращает `JournalTopicsOut` с
`JournalTopicOut[]`; `id`, `name`, `order_num` required non-null, extra fields
запрещены. Read DTO не включает subject/archive metadata и не доказывает
archive/restore semantics.

Journal topic create/update теперь также curated: POST принимает закрытый
`TopicCreate`, PUT — закрытый `TopicUpdate`, оба требуют только non-null `name` и
возвращают `JournalTopicOut`. Текущие HTTP 200 и business errors сохранены;
archive/restore receipts, versioning и idempotency не входят в этот contract.

Journal topic DELETE `/api/journal/topics/{topic_id}` возвращает closed
`JournalTopicArchiveOut` с literals `detail="ok"`, `is_archived=true`; POST
`/api/journal/topics/{topic_id}/restore` возвращает отдельный closed
`JournalTopicRestoreOut` с `detail="ok"`, `is_archived=false`. Оба endpoint не
принимают body. Contracts не добавляют version/idempotency и не меняют повторные
операции, assignment checks или `409` при архивном родительском предмете.

Active periods GET `/api/periods` возвращает curated `ActivePeriodsOut`:
`current_period` является required nullable `ActivePeriodOut`, `periods` —
required list той же projection. Item fields `id`, `name`, `period_type`,
`start_date`, `end_date` required non-null; даты имеют OpenAPI `format: date`.
Admin period CRUD и правила quarter/half-year этим DTO не определяются.

Teacher analytics topics GET `/api/teacher/analytics/topics` возвращает closed
`TeacherAnalyticsTopicsOut`: required non-null `class_avg` и список closed
`TeacherAnalyticsTopicOut`. Каждый item требует `id`, `name`, `avg`, `bad_count`,
`total_count`, `bad_ratio`; пустой список допустим. Query `class_id`, optional
`subject_id`/`period` сохранены; dashboard/problem-students/works responses и
report rendering не входят в этот contract.

Teacher analytics dashboard GET `/api/teacher/analytics/dashboard` возвращает
closed `TeacherAnalyticsDashboardOut`: required class ID/name, period start/end,
closed KPI, dynamics, shared problem-topic items и attention students. Все nested
fields required non-null, arrays могут быть пустыми. Contract сохраняет existing
query parameters и не определяет polling/abort, chart/report rendering либо
problem-students/works responses.

Teacher analytics problem-students GET `/api/teacher/analytics/students/problem`
возвращает closed `TeacherAnalyticsProblemStudentsOut`: required students list и
`problem_count`. Closed item требует ID/name/average, total/twos/threes counts,
boolean `is_problem` и string `issues[]`; пустой список допустим. Contract не
определяет thresholds/sorting и не меняет report `reason` rendering.

Lesson occurrence PATCH принимает существующий `LessonOccurrenceUpdate` и
возвращает curated `LessonOccurrenceUpdateOut`. Receipt всегда содержит required
status, occurrence/date/lesson, required nullable `topic_id` и новую `version`;
status ограничен `scheduled`/`cancelled`/`completed`. Conflict/error schemas и
optimistic-lock/transfer semantics остаются отдельной границей.

Journal grade detail GET `/api/journal/grades/{grade_id}` возвращает закрытый
`JournalGradeDetailOut`. Все keys required; grade/work-type/date/comment/attendance/
color/created/subject/student/topic fields могут быть nullable согласно текущему
wire payload. Nested subject/student имеют отдельные closed schemas. Поле награды
называется `points`; legacy aliases и grade mutation receipts не входят в DTO.

Journal grade PUT на том же path принимает existing `UpdateGradeRequest` и
возвращает closed `JournalGradeUpdateOut`: required version, nullable grade/color,
authoritative points, applied `points_diff` и `new_balance`. Contract не превращает
PUT в PATCH и не меняет optional request fields, optimistic lock или conflict body.

Journal grade POST `/api/journal/grades` принимает existing `AddGradeRequest` и
возвращает closed `JournalGradeCreateOut`: required grade ID, required nullable
grade/color/attendance, points, new balance и message. Optional nullable request
fields и string `lesson_date` сохранены; receipt не добавляет version/idempotency.

Journal grade DELETE `/api/journal/grades/{grade_id}` не принимает request body,
требует integer query `version` и возвращает closed `JournalGradeDeleteOut` с
required non-null `success` и `message`. DTO не описывает refund/transaction data;
optimistic-lock conflict и локальный refresh lifecycle остаются отдельной границей.

Consumer-driven P0 surface дополнительно закрывает общими schemas student/parent
diary, grades и finals aliases, student quests, основной journal aggregate,
final-grade и lesson-template receipts, journal import preview/execute и teacher
bulk-balance. Empty branches имеют тот же required shape, nullable producer fields
явны, а все live Web consumers используют generated DTO. Curated manifest содержит
111 paths; internal/unconsumed routes добавляются только при появлении tracked client.

Checked-in `perum-tenant/mobile-descriptor.json` валидируется authoritative Core
schema, а nested Core/Tenant OpenAPI shapes сравниваются в
`perum-core/tests/test_release_manifest.py`; этот test запускается отдельным CI и
release gate до публикации Tenant image.
