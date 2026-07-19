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
- Core scanner stack fail-closed проверяет existing managed network/container
  drift: pinned image, exact networks/mounts, no published ports, cap-drop,
  resources, health/read-only/user/no-new-privileges/PID limits; relay ограничен
  maximum connections, connect/idle/total timeout и byte budget;
- добавлен отдельный CI job с disposable PostgreSQL 15: real two-session
  `FOR UPDATE SKIP LOCKED`, forced expired lease + replacement worker + stale
  verdict fencing, и Alembic `0036→0037→0036→0037` с schema/index/data assertions;
  downgrade scanner migration проверяется как data-destructive для lease/evidence
  metadata при сохранении base media rows;
- первый run `29690972983` fail-closed выявил исторический PostgreSQL migration
  blocker: `tenant_0028_grade_optimistic_lock` не помещался в стандартный
  `alembic_version.version_num VARCHAR(32)`; migration расширяет поле до 64 до
  Alembic revision update, повторный green evidence обязателен;
- run `29691240581` подтвердил migration round-trip, `SKIP LOCKED` и winner state,
  но выявил test-fixture contamination: concurrency scenario наследовал baseline
  clean result migration-preservation scenario. Fixtures разделены; invariant
  остаётся строгим: один winner result и один audit, без stale evidence;
- полный CI run `https://github.com/syb1v/perum/actions/runs/29691375244`
  зелёный: named PostgreSQL scanner job выполнил `2 passed` на PostgreSQL 15.
  Это закрывает migration/concurrency evidence, но не Docker/EICAR pilot;
- purpose-built relay image копирует только production relay module, запускается
  как `65532:65532`; candidate workflow проверяет metadata и constrained runtime,
  затем публикует immutable tag с SBOM/provenance и `status=candidate` artifact;
- Core reconciliation проверяет running/restart/privileged/cap-add, exact relay
  command/environment и exact clamd health command;
- candidate run `29692882209` прошёл constrained runtime и GHCR push, но завершился
  fail-closed на GitHub Attestations API, недоступном для user-owned private repo.
  Этот digest не считается recorded evidence; registry-native BuildKit SBOM/
  provenance сохранены, workflow переключён на post-push exact digest inspection;
- run `29692953493` полностью зелёный и подтвердил constrained runtime/push/digest
  inspection, но handoff metadata не фиксируется как финальное evidence: BuildKit
  output digest включает OCI attestation manifests, поэтому misleading single
  `platform` claim удалён и требуется повторный clean artifact;
- final candidate run `https://github.com/syb1v/perum/actions/runs/29693030308`
  зелёный; artifact фиксирует source commit `1e6929d`, `status=candidate` и exact
  relay OCI digest `sha256:0193187f6d3af2d8a4f443ad341668e3c52d48d44f926970d3e6a8b62592c830`.
  Это candidate evidence, не operator approval и не test-node pilot;
- clamd updater topology реализована без dual-homing: managed non-internal update
  network содержит только non-root freshclam updater; clamd остаётся только в
  internal backend. Единственный shared channel — signature volume (`rw` updater,
  `ro` clamd). Core ждёт fresh database до запуска clamd и fail-closed сверяет обе
  сети, mounts, commands, health, users и limits;
- candidate workflow собирает clamd/updater image, и на пустом volume обязан
  скачать валидные signatures, запустить constrained read-only clamd, подтвердить
  network separation и получить clean `OK`/EICAR `FOUND` через relay. До первого
  зелёного run эти пункты не считаются evidence;
- run `29693610127` fail-closed остановил publication: harness увидел первый
  database file и запустил clamd до завершения initial `main` + `daily` set.
  Readiness теперь требует оба database files и успешный `clamscan --database`
  validation; timeout diagnostics включают container state и logs;
- run `29693812474` подтвердил успешные freshclam download и встроенную проверку
  `daily/main/bytecode`, но дополнительная readiness validation не запускалась:
  image содержал `clamdscan`, но не `clamscan`. Добавлен пакет `clamav` и explicit
  binary presence gate для `clamscan`, `clamdscan`, `freshclam` до network tests;
- run `29694085653` fail-closed выявил Debian package split: `clamav-daemon` не
  предоставляет standalone `clamdscan` client. Image теперь явно устанавливает
  `clamdscan`; binary contract не ослаблен;
- run `29694159245` подтвердил наличие `clamdscan`, но preflight ошибочно запускал
  daemon client до старта daemon. Presence теперь проверяется через `command -v`;
  функциональность клиента по-прежнему обязательна после startup через health и EICAR;
- run `29694223975` дошёл до clamd start и fail-closed выявил invalid config
  directive `MaxStreamLength`; исправлено на поддерживаемое `StreamMaxLength`,
  startup logs направлены в stderr для дальнейшей диагностики;
- run `29694399412` подтвердил config parse, но ClamAV secure logfile handling
  отверг `/dev/stderr` symlink. File logging directive удалён: daemon остаётся
  foreground, Docker captures process output, harness сохраняет state/logs;
- run `29694559400` прошёл cold download и clamd readiness, но combined protocol
  assertion не показывал, какой public test verdict не совпал. Clean/EICAR checks
  разделены и выводят только privacy-safe response mismatch без payload contents;
- run `29694660860` показал relay clean EOF. Gate добавляет direct-backend clean
  control перед relay и relay logs при mismatch, чтобы строго разделить clamd
  protocol/config и relay/network failure без изменения framing/assertions;
- run `29694805068` подтвердил EOF и на direct path: harness ждал connection EOF,
  тогда как production adapter читает null-terminated ClamAV response. Candidate
  client синхронизирован с production `readuntil(b"\\0")` и bounded timeout;
- run `29694915610` показал non-zero direct client, но subprocess wrapper скрывал
  stderr. Wrapper теперь fail-closed включает stdout/stderr disposable public-test
  command, чтобы различить timeout, incomplete response и connection failure;
- run `29695043515` подтвердил direct INSTREAM `IncompleteReadError` с нулём bytes.
  Gate добавляет direct `zVERSION` control через тот же socket и clamd logs при
  INSTREAM failure; production framing не меняется без server-side evidence;
- run `29695203626` подтвердил working direct `VERSION`, healthy daemon и только
  INSTREAM EOF. Причина runtime contract: read-only clamd не имел writable scan
  temp. Добавлен bounded `/tmp` tmpfs (`16m`, `noexec`, `nosuid`), который Core
  создаёт и fail-closed сверяет; signature volume остаётся read-only;
- candidate run `https://github.com/syb1v/perum/actions/runs/29695347053`
  зелёный: empty-volume freshclam validation, network separation, constrained
  clamd/relay, direct VERSION/clean и relay clean/EICAR пройдены; immutable
  digests опубликованы с SBOM/provenance и inspected. Source `6e37fff`; clamd
  `sha256:48251e249021a5d36fa420d172b0bd4e319e4e1ceb01544f50d85b58d54044e8`,
  relay `sha256:d36e7d760c26f38f8b416d65300b7e6749ad04581bb0579581fb1d1141745c27`.
  Оба имеют только `candidate` status; recreation persistence не проверена;
- candidate gate расширен: фиксирует SHA-256 fingerprint всех signature DB,
  останавливает updater и требует продолжения clean scans, останавливает clamd и
  требует fail-closed request, пересоздаёт clamd с тем же RO volume и требует
  неизменный fingerprint плюс повторные clean/EICAR. Exact network/mount/tmpfs
  inspect assertions обязательны; первый green run ещё не записан;
- recreation/outage run `https://github.com/syb1v/perum/actions/runs/29695993596`
  зелёный. Source `99c3110`; clamd candidate
  `sha256:61b2d06a30dff6891345d3002b9e5b8eaa7952344ddf7d58656a46b9498087b2`,
  relay candidate `sha256:c26731987bfe7ead0eb1d86f6d1fea2d553f50890a7b361cc7b2ce692949c7d7`.
  Fingerprint persistence, updater outage scanning, clamd outage fail-closed и
  recreated clean/EICAR подтверждены; target-node evidence остаётся открытым;
- stale/recovery candidate scenario использует production Tenant image и
  `ClamAVScanner`, а не mtime approximation: с `max_signature_age_h=0` real
  VERSION header должен дать `stale_signatures` и `unavailable` без accepted scan;
  с policy `48h` тот же daemon должен вернуть ready, clean и infected/EICAR.
  Первый green real-Docker run ещё не записан;

Что не завершено и не должно считаться production evidence:

1. Реальные Docker inspect значения и image-defined runtime behaviour ещё не
   подтверждены approved images на тестовой node.
2. Approved digest-pinned clamd и relay images отсутствуют. Relay имеет только
   candidate; clamd/updater candidate ждёт real-Docker workflow evidence.
3. Docker CLI отсутствовал, поэтому compose/container topology и real EICAR не
   проверялись.
4. PostgreSQL доступен, но локальные credentials были отклонены; migration
   проверена только SQLite upgrade smoke.
5. `npm` отсутствовал; frontend не изменялся, но repository-wide npm gates в этом
   цикле не запускались.
6. Freshclam persistence, stale-signature recovery, resource benchmark и
   operational dashboards не проверены на реальной node.

Порядок продолжения без изменения архитектуры:

1. Выполнить security/operator review exact relay candidate digest; не повышать
   статус без review и test-node evidence.
2. Получить зелёный production-parser stale/recovery run; затем выполнить
   security/operator review exact candidates и target-node inspect/outage contract.
3. PostgreSQL upgrade/downgrade/upgrade закрыт run `29691375244`.
4. На тестовой node с двумя школами выполнить все gates из
   [SCANNER_OPERATIONS.md](SCANNER_OPERATIONS.md), включая EICAR и сетевую
   изоляцию.
5. Проверить outage/restart/lease recovery, stale signatures и fairness/load при
   5-10+ школах; записать evidence без PII.
6. Только после успешного pilot реализовать attachment UI/binding rollout и
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
