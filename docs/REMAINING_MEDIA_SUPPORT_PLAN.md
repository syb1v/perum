# Остаток плана: media scanner и native support admin

Документ передаёт следующие независимые циклы после завершения Friends hardening,
Native Friends UI и controlled social rollout. Live status и проценты ведутся
только в [PRODUCT_MASTER_PLAN.md](PRODUCT_MASTER_PLAN.md).

## 1. Production media scanner

Утверждённое решение:

```text
один node-local clamd на каждую school-hosting node
+ отдельный relay для каждой школы
+ INSTREAM без shared school volumes
+ fail-closed и signatures не старше 48 часов
+ минимум 8 ГиБ RAM на scanner-capable multi-school node
```

Core не принимает и не проксирует файлы. School app остаётся только в своей
school network, relay подключён к своей school network и общей internal scanner
network, а `clamd` подключён только к scanner network. TCP 3310 нельзя публиковать
на host.

Точка остановки на 2026-07-19:

- private storage, upload sessions, quarantine, MIME/magic/size/SHA-256,
  bindings, authorization, cleanup и shared clients готовы;
- production `ClamAVScanner` реализует async `VERSION`/`INSTREAM`, строгий parser,
  timeouts, concurrency limit и freshness gate;
- migration `tenant_0037_scanner_foundation` добавляет durable attempts,
  `next_scan_at`, lease token/expiry и scanner evidence;
- worker claim/retry/backoff и crash recovery больше не зависят от памяти процесса;
- provisioning создаёт один internal scanner backend, shared clamd и отдельный
  relay каждой школы без school volumes и host ports;
- scanner images обязательны в immutable `@sha256:` формате, scanner mode требует
  минимум 8 ГиБ RAM;
- Tenant unit suite: 118 passed; Core full suite: 175 passed; Alembic heads
  `tenant_0037_scanner_foundation` и `0034_social_rollout`;
- `social_attachments` и `support_attachments` остаются `false`, пока production
  scanner не пройдёт pilot gates.
- независимый review Tenant worker/protocol завершён: scan имеет total deadline,
  evidence ограничен DB contract, future signatures fail closed, финализация
  fenced lease token/expiry, cleanup не удаляет active lease, clean transition
  детерминированно восстанавливается после crash, infected файл удаляется только
  после durable verdict;

Что не завершено и не должно считаться production evidence:

1. Core scanner stack ещё не inspect/reconcile существующие Docker resources, а
   byte-transparent relay не имеет total/idle/byte limits.
2. Approved digest-pinned clamd и relay images ещё не собраны и не опубликованы.
3. Docker CLI отсутствовал, поэтому compose/container topology и real EICAR не
   проверялись.
4. PostgreSQL доступен, но локальные credentials были отклонены; migration
   проверена только SQLite upgrade smoke.
5. `npm` отсутствовал; frontend не изменялся, но repository-wide npm gates в этом
   цикле не запускались.
6. Freshclam persistence, stale-signature recovery, resource benchmark и
   operational dashboards не проверены на реальной node.

Порядок продолжения без изменения архитектуры:

1. Добавить fail-closed inspect/reconciliation network/clamd/relay и bounded relay
   time/bytes/connections; проверить drift tests.
2. Провести PostgreSQL two-session lease/fencing и migration round-trip evidence.
3. Собрать approved immutable clamd и relay images; убедиться, что image содержит
   working `freshclam`, healthcheck и relay module при `cap_drop=ALL/read_only`.
4. Выполнить PostgreSQL upgrade/downgrade/upgrade на disposable production-like DB.
5. На тестовой node с двумя школами выполнить все gates из
   [SCANNER_OPERATIONS.md](SCANNER_OPERATIONS.md), включая EICAR и сетевую
   изоляцию.
6. Проверить outage/restart/lease recovery, stale signatures и fairness/load при
   5-10+ школах; записать evidence без PII.
7. Только после успешного pilot реализовать attachment UI/binding rollout и
   отдельным циклом изменить release capability flags. Не включать capabilities
   только на основании unit-тестов.

## 2. Native school support admin inbox

Цикл не зависит от scanner, если выполняется без attachments и push.

Foundation завершён 2026-07-19: отдельный `support_admin` release capability
ограничивает rollout; `school_admin` и `director` получили account-scoped cached
список и thread, unread/urgent/unassigned summary, idempotent online reply/read и
явные offline/read-only состояния. Requester и admin routes/query keys не
смешиваются; `admin_inbox` сообщения организации остаются видимы только школьным
операторам. Attachments и push отсутствуют.

Conflict-safe management завершён 2026-07-19: Tenant возвращает текущий
`assignee_id`, а Native изменяет status/category/priority/assignment только после
authoritative versioned response. Повтор одного действия сохраняет
`client_action_id`; `VERSION_CONFLICT` не применяет локальное значение и вызывает
refetch server ticket/list/unread.

Delivery observability foundation завершён 2026-07-19 без миграций и расширения
privacy boundary. Tenant admin-only endpoint показывает только persisted
`pending`/`retrying`/`delivered`, attempts, durations и server-calculated SLA;
Native отображает cached read-only delivery card. Aggregate telemetry содержит
только counts, breach count и oldest pending age. Core typed endpoint выводит
`pending`/`delivered` по monotonic ACK cursor. Payload, errors, message content,
ticket/correlation/user IDs не экспортируются. Terminal `failed` и точный Core
`delivered_at` не существуют в текущей retry/pull модели и не симулируются.

Operational dashboard slice завершён 2026-07-19: Core строго принимает только
четыре non-negative aggregate поля из свежего telemetry snapshot, stale/missing/
malformed данные маркирует `unknown`, platform/org dashboards показывают bounded
summary и school status, а `/metrics` экспортирует шесть platform-wide gauges без
labels. Prometheus может вычислять условия SLA/retry/unknown, но Alertmanager,
receivers и notification routing в репозитории не настроены и production alert
delivery не заявляется.

1. Добавить durable admin reply/read/metadata mutations, только если offline send
   будет отдельно утверждён в scope.
2. Спроектировать terminal failure/recovery policy и exact Core delivery receipts,
   если operations утвердит push/outbox semantics; до этого `failed` запрещён.
3. Отдельно спроектировать и проверить Alertmanager/Grafana contact-point routing,
   secret-backed receivers, deduplication и test notification delivery.

Не включать attachments до scanner slice, push до delivery adapter, full
platform/org mobile parity или изменение privacy boundary поддержки.

## 3. Отложенные этапы

Stage F pilot и Homework multi-device QA остаются отложенными. Prerequisites и
evidence описаны в [DEFERRED_STAGE_REQUIREMENTS.md](DEFERRED_STAGE_REQUIREMENTS.md).

## 4. Порядок продолжения

1. Завершить review и production-like scanner pilot по разделу 1.
2. Независимо можно реализовать native support admin inbox без attachments/push.
3. После scanner pilot отдельно подключить support/social attachments и UI.
4. После delivery provider отдельно подключить push.
5. Каждый цикл отдельно проверять, документировать и коммитить.
