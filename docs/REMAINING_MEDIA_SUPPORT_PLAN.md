# Остаток плана: media scanner и native support admin

Документ передаёт следующие независимые циклы после завершения Friends hardening,
Native Friends UI и controlled social rollout. Live status и проценты ведутся
только в [PRODUCT_MASTER_PLAN.md](PRODUCT_MASTER_PLAN.md).

## 1. Production media scanner

Текущее состояние:

- private storage, upload sessions, quarantine, MIME/magic/size/SHA-256,
  bindings, authorization, cleanup и shared clients готовы;
- scanner contract работает fail-closed;
- `social_attachments` и `support_attachments` остаются `false`, пока production
  scanner не выбран, не развёрнут и не подтверждён heartbeat-ом.

Сравнить минимум три варианта:

1. ClamAV daemon/container на каждой node.
2. Общий ICAP/scanner service внутри доверенной инфраструктуры организации.
3. Внешний malware scanning API только при допустимых privacy/data residency
   условиях для данных несовершеннолетних.

До выбора проверить privacy/data residency, fail-closed timeout/retry, изоляцию
школ, signature updates/readiness, node capacity, лицензирование, observability и
incident rollback. Без утверждённого scanner и operational owner интеграцию не
начинать. После выбора отдельным циклом выполнить deployment, tenant adapter,
heartbeat gating, malware/quarantine tests и пилот одной школы.

## 2. Native school support admin inbox

Цикл не зависит от scanner, если выполняется без attachments и push.

1. Native inbox только для `school_admin` и `director`.
2. Список, thread, unread, assignment, status/category/priority и conflict-safe
   metadata actions через существующие version/idempotency contracts.
3. Account-scoped cache и loading/error/empty/offline-read состояния.
4. Без optimistic metadata updates; `409` показывает server snapshot.
5. Delivery observability для tenant outbox/Core relay: pending, delivered,
   retrying, failed и age/SLA без содержания сообщений и PII.
6. Role/school isolation, OpenAPI types, mobile и tenant tests, feature gate.

Не включать attachments до scanner slice, push до delivery adapter, full
platform/org mobile parity или изменение privacy boundary поддержки.

## 3. Отложенные этапы

Stage F pilot и Homework multi-device QA остаются отложенными. Prerequisites и
evidence описаны в [DEFERRED_STAGE_REQUIREMENTS.md](DEFERRED_STAGE_REQUIREMENTS.md).

## 4. Порядок продолжения

1. Выбрать scanner либо остановиться с подробным сравнением.
2. Независимо реализовать native support admin inbox без attachments/push.
3. После scanner pilot отдельно подключить support/social attachments.
4. После delivery provider отдельно подключить push.
5. Каждый цикл отдельно проверять, документировать и коммитить.
