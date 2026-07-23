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

Active periods GET `/api/periods` возвращает curated `ActivePeriodsOut`:
`current_period` является required nullable `ActivePeriodOut`, `periods` —
required list той же projection. Item fields `id`, `name`, `period_type`,
`start_date`, `end_date` required non-null; даты имеют OpenAPI `format: date`.
Admin period CRUD и правила quarter/half-year этим DTO не определяются.

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

Checked-in `perum-tenant/mobile-descriptor.json` валидируется authoritative Core
schema, а nested Core/Tenant OpenAPI shapes сравниваются в
`perum-core/tests/test_release_manifest.py`; этот test запускается отдельным CI и
release gate до публикации Tenant image.
