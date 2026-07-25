# PERUM: live product status и master plan

> Этот файл — единственный источник текущего продуктового статуса, процентов,
> handoff и roadmap. Архитектурные и операционные документы не должны дублировать
> эти оценки. Последнее обновление live-блока: **2026-07-24**.

<!-- LIVE_PROGRESS: edit this block after every completed engineering cycle -->
## Live progress

| Срез | Значение | Методика |
|---|---:|---|
| Dynamic mobile descriptor | **10/11 = 90.9%** | 11 проверяемых пунктов Definition of Done; закрыты 10, lifecycle matrix Stage F не закрыта |
| Descriptor stages | **5/6 = 83.3%** | Stages A-E завершены; Stage F pending |
| Stage F lifecycle matrix | **11/12 = 91.7%** | Automated rows и named CI run `29598407038` прошли; privacy-safe diagnostics/ledger/collector foundation готов, deliberate rollback и operator Mobile export evidence pending |
| Общая готовность продукта | **28-33%, midpoint 30%** | Консервативная экспертная переоценка полного scope после durable support/social offline slices, Native Friends и controlled rollout foundation; billing, policy, full role parity, scanner/push integrations и production evidence сохраняют большую часть remaining scope |
| Исторический rewrite | **99% в прежнем scope** | Только завершённость старого rewrite/foundation scope из legacy ledger; не означает готовность текущего полного продукта |

**Текущий этап:** security hardening и production-пилот утверждённого node-local ClamAV
foundation перед включением social/support attachments. Реализованы один shared
`clamd` на school-hosting node, отдельные per-school relay, `INSTREAM`, durable
lease/retry queue, freshness/readiness и privacy-safe backlog telemetry. Disposable
PostgreSQL и real-Docker candidate evidence подтверждены, но operator review,
target-node inspect/load pilot и production sizing ещё не выполнены, поэтому
capability flags остаются `false`. Native Friends UI и двухступенчатый
controlled rollout foundation завершены. Native `school_admin`/`director` inbox
получил отдельный release capability, cached list/thread, unread summary,
durable text reply/read и durable conflict-safe metadata/assignment без
optimistic updates, attachments и push. One-school pilot Stage F и multi-device Homework
conflict QA явно отложены; их prerequisites вынесены в
[DEFERRED_STAGE_REQUIREMENTS.md](DEFERRED_STAGE_REQUIREMENTS.md), незакрытые шкалы
и remaining scope не изменены.

Shared domain policy для school support operator теперь один для Web и Mobile:
exact роли `school_admin`/`director` проверяются `isSchoolSupportOperator`, тогда
как более широкий legacy `isSchoolAdmin` по-прежнему включает `admin`. Domain
contract test фиксирует это различие и не позволяет случайно расширить доступ к
support inbox/notification routing при изменении клиентских экранов.

Friends Web/Mobile DTO больше не дублируют social response shapes: `StudentProfile`,
`StudentPage`, `FriendRequestOut` и `BlockOut` импортируются из generated Tenant
OpenAPI. Contract gate фиксирует endpoint-to-schema bindings, обязательные поля и
required nullable integer `next_cursor`, поэтому regeneration не может незаметно
вернуть clients к untyped или расходящимся pagination models.

Homework read/state response contract также закрыт: Tenant возвращает typed
`HomeworkListOut` и `HomeworkStateOut`, включая versioned student state и replay
receipt; Mobile использует generated schemas. Поскольку тот же list endpoint для
teacher/parent законно возвращает `student_state=null`, student client fail closed
отбрасывает такие rows вместо небезопасного обращения к version/status.

School social moderation contract теперь typed end-to-end: inbox page, evidence
detail и action receipt имеют разные privacy-minimized Pydantic/OpenAPI schemas,
а Web использует generated types. List не содержит evidence, detail сохраняет
opaque participant label и nullable body, action receipt фиксирует optimistic
`version`; contract gate не позволяет этим endpoint bindings незаметно стать untyped.

Mobile social query family теперь имеет один account-scoped invalidation plan для
reconnect, realtime events и durable send/read success. Broad messages key больше
не собирается вручную в providers; read replay инвалидирует также unread count,
поэтому badge не остаётся stale после offline cursor sync. Pure test гарантирует,
что plans не пересекают другой account, support/admin-support или Homework cache.

Mobile support query plans также разделены по requester/admin namespaces.
Requester create/reply/read не затрагивают operator cache; admin action/conflict,
reply/read обновляют ticket prefix и unread, thread — только reply. Redundant
detail invalidations удалены, потому что TanStack prefix tickets уже покрывает
detail rows; pure test фиксирует account и family isolation.

Support escalation delivery telemetry получила первый cross-component test-utils
contract: versioned privacy-safe fixture одновременно проверяет Tenant exporter и
Core parser/status rollup. Exact allowlist содержит только четыре non-negative
aggregate поля; extra identifiers, включая `school_id`, теперь fail closed дают
unknown вместо молчаливого принятия. Fixture не содержит school/user/host data.

Весь school metrics persistence boundary теперь также versioned и sanitized:
`school_metrics.v1.json` связывает Tenant exporter с Core allowlist для scalar,
social, scanner и support sections. Core сохраняет только finite non-negative
aggregates; unknown top-level fields отбрасывает, malformed/extended nested section
не сохраняет целиком. Heartbeat request остаётся совместимым со старыми Tenant
images, но произвольный authenticated dict больше не попадает в JSON payload.

Tenant deployment snapshot sender и Core strict consumer теперь связаны одним
`deployment_snapshot.v1.json` fixture. Он фиксирует exact fields, schema version,
strict readiness booleans, non-negative social generation, timezone-aware
`observed_at` и extra-field rejection. Это automated contract parity, не operator
Mobile ledger export, rollback proof или Stage F pilot evidence.

Mobile offline preferences больше не дублирует сетевой DTO вручную: GET и PATCH
`/user/preferences` используют generated `PreferencesResponse`, PATCH payload —
generated `PreferencesPatch`. Tenant PATCH фактически уже возвращал тот же snapshot,
но не объявлял response model и публиковал `unknown` в OpenAPI; route annotation,
snapshot и curated endpoint/request/required-field gate теперь выровнены. Локальные
outbox mutation/snapshot types остаются client-owned и не смешиваются с API DTO.

Push registration status/put/revoke теперь имеют отдельные Pydantic/OpenAPI
responses и generated Mobile request/response aliases. Исправлен restart restore:
Tenant возвращал nullable `registration`, а Mobile читал несуществующий boolean
`registered`, поэтому активная регистрация могла отображаться выключенной после
перезапуска. Curated gate фиксирует три endpoint bindings и required fields; pure
Mobile test отделяет active registration receipt от `delivery_enabled=false`.
Provider delivery, credentials и tap/cold-start lifecycle этим не закрыты.

Mobile social durable send/read paths теперь формируют payload через generated
`MessageCreate`/`ReadCreate`, report path сохраняет generated `ReportCreate`.
Curated OpenAPI gate связывает все три POST endpoints с request schemas и фиксирует
required message/report identities; pure mapper test подтверждает, что immutable
`client_message_id` и `client_action_id` из account-scoped outbox доходят в API
payload без переименования. Это не расширяет social scope до groups, attachments,
push или parent observer policy.

Mobile requester support ticket creation/reply/read outboxes теперь формируют
payload через generated `TicketCreate`, support `MessageCreate` и `ReadCreate`.
Curated gate фиксирует три POST request bindings, required identities и наличие
optional `client_action_id`: Web read consumers сохраняют backward-compatible
`message_id`-only path, тогда как durable Mobile mapper всегда переносит stable
read action identity. Pure test покрывает обе ticket creation identities, reply и
read cursor. Admin assignment/metadata/escalation requests остаются отдельным slice.

Mobile admin support metadata/assignment/reply/read paths теперь также связаны с
generated `TicketPatch`, `AssignCreate`, support `MessageCreate` и `ReadCreate`.
`AdminTicketAction` использует generated status/category/priority literals вместо
произвольного `string`; pure payload helper возвращает generated patch/assign union,
а UI controls сохраняют literal type до enqueue. Curated gate фиксирует четыре
operator request bindings и обязательные action/version identities. Native
escalation request не реализован и в этот slice не входит.

Teacher classes read contract теперь typed end-to-end: Tenant возвращает закрытые
`TeacherClassesOut`/`TeacherClassOut`, включая required nullable `created_at`, а
Web больше не дублирует response DTO и не приводит generated `unknown` двойным
cast. Curated gate фиксирует endpoint binding, item schema, required fields и
date-time nullability. Остальные teacher endpoints и query families этим не закрыты.

Teacher homework profile feed также получил отдельный закрытый contract:
`TeacherHomeworkListOut`/`TeacherHomeworkOut` не смешиваются с расширенным
student-facing `/api/homework`, а Web использует generated DTO вместо ручного
`ActivityItem` и двойного cast. Required nullable `created_at`, `class_name` и
`subject_name` закреплены gate и отображаются fail-safe; остальные teacher
endpoints и query families остаются открытыми.

Teacher works journal feed теперь также typed: GET `/api/teacher/works` возвращает
closed paginated `TeacherWorksOut`/`TeacherWorkOut` с exact `homework|control`
literals и required nullable class/subject/description/date fields. Active Web tab
удалил ручной DTO и типизирует существующий raw-fetch JSON. Fetch/auth/error,
filtering, ordering, offset pagination, infinite-scroll merge и details UI не
менялись.

Teacher diary GET теперь typed для обоих активных Web consumer-ов: closed
`TeacherDiaryOut` фиксирует week/day map, nested lessons, homework attachments,
control work и occurrence status/version metadata. Required nullable lookup/bell/
attachment fields отражают service producer; stale client-only `group_name` удалён.
Week navigation, schedule queries, modal selection, occurrence lifecycle и cache
semantics не менялись.

Teacher homeroom GET `/api/teacher/my-class` теперь также typed: closed
`TeacherHomeroomOut` фиксирует assigned/unassigned branches, required nullable
class projection, student roster и aggregate stats. Homeroom page удалил ручные
network DTO; nullable names, active enrollment literal и nested refs защищены
curated gate. Bulk-balance mutation, selection UX и refresh lifecycle не менялись.

Parent analytics read family теперь typed как единая boundary: initial children,
grades summary, period analytics и transactions используют closed generated DTO.
Student-owned summary/analytics schemas переиспользуются parent aliases, поэтому
две role routes не могут расходиться; no-class analytics нормализован required
`current_period=null`. Parent page удалил ручные DTO. Diary/grades/finals,
Promise.all/Abort/rendering и любые mutations не менялись.

Consumer-driven Shared Contracts P0 теперь закрыт: оставшиеся student/parent diary,
grades/finals, quests, main journal aggregate, final/template receipts, import DTO и
teacher bulk-balance/works boundaries используют closed generated schemas. Все 96
curated paths имеют drift gate; live Web consumers больше не держат manual wire DTO,
`unknown[]`, response `any` или raw JSON casts. Internal/unconsumed routes не входят
в acceptance criterion до появления tracked consumer.

Follow-up audit закрыл пропущенную active Core boundary organization support
escalation: pending/detail/approve/reject/relay теперь имеют отдельные closed schemas,
Web widget использует generated Core DTO, а curated gate фиксирует exact bindings и
required fields. Curated manifest расширен до 97 paths; approval/version/idempotency,
authorization и UI semantics не менялись.

React Native code foundation также закрыт на repository-controlled уровне: strict
runtime config объединяет Expo/auth/link/push, initial/warm link и cold/warm push tap
идут через consume-once coordinator, cache получил allowlist/throttle/logout fencing,
а root shell показывает startup/offline/error state. EAS preflight pinned и mobile
suite содержит 107 tests. Реальные credentials, domain associations, provider
delivery и physical-device evidence остаются pilot blockers, а не code foundation.

Expo project initialization завершена: tracked slug выровнен с remote project
`@sybiv/perum`, а EAS linkage подтверждён для project ID
`eebb39ca-480d-400b-b723-7258d6e880b6`. Native bundle/package IDs остаются
`app.perum.mobile`. Signing/provider credentials, remote EAS environment и signed
preview builds по-прежнему не считаются готовыми без отдельного evidence.

Operator flow для Mobile теперь унифицирован в `perum-mobile/mobile.sh`: Expo Go
запускается tunnel-командой, EAS preview/production builds проходят config/typecheck/
107-test preflight и live project check. Это уменьшает риск запуска не из той папки
или против другого Expo project, но не заменяет remote EAS environment, signing и
store/provider credentials.

Первый iOS preview invocation обнаружил EAS CLI crash на export-compliance prompt и
пустой remote preview environment. Canonical Expo SDK 57 поле
`ios.config.usesNonExemptEncryption=false` теперь исключает prompt, а non-secret
public runtime values закреплены в EAS profiles. Signing credentials и завершённый
signed build всё ещё требуют отдельного operator evidence.

Native school escalation request теперь реализован поверх существующего durable admin
action outbox: exact operator role/capability, open/non-escalated guards, privacy
warning, generated `EscalateCreate`, stable action ID/version, retry/recovery и
explicit conflict discard. Client не меняет escalation state до authoritative Tenant
receipt; signing/device evidence в этот repository-controlled slice не входит.

Internal Tenant↔Core escalation receipts теперь закрыты и проверяются до local state
mutation: intake, outbound pull и ack фиксируют exact literals, UUID, non-negative
versions/cursors и `ok=true`. Malformed 2xx больше не может пометить outbox delivered,
создать частичный message или продвинуть cursor; curated manifest расширен до 100
paths. Terminal retry/dead-letter policy остаётся отдельным scope.

Terminal escalation delivery policy теперь закрыта на repository уровне: permanent
4xx немедленно переходят в `dead_letter`, retryable transport/5xx/408/425/429 имеют
лимит 8 попыток, а school operator видит authoritative `failed` и может явно вернуть
тот же privacy-safe payload/correlation identity в очередь. Recovery создаёт audit
event; migration и 101-й curated path фиксируют lifecycle. Hosted deployment evidence
остаётся отдельным внешним шагом.

Repository alerting foundation для escalation delivery теперь готов: terminal
`failed` проходит через versioned Tenant telemetry/Core exact parser/rollup в
unlabeled Prometheus gauge; четыре rules покрывают DLQ, SLA, prolonged retry и stale
telemetry. Prometheus и local-null Alertmanager wiring, а также incident runbook
валидированы. Approved external receiver и test firing/resolved delivery evidence
остаются обязательными operator blockers и не заявляются готовыми.

EAS Update repository configuration завершена: SDK 57-compatible `expo-updates`,
project update URL и `appVersion` runtime policy закреплены, remote preview channel и
branch созданы. Повторный iOS build прошёл config/typecheck/107 tests и остановился
только на отсутствии Apple internal-distribution credentials; signing по-прежнему
не заявляется готовым.

Tenant Discovery automated readiness усилена deterministic rollback success/failure
matrix и fail-closed pilot collector: anonymous discovery не получает bearer,
redirect/media-type/size/schema/school mismatch отклоняются, synthetic evidence
всегда `NO-GO`. Это automated readiness, не signed Stage F pilot evidence; operator
Mobile export и реальный one-school pilot остаются обязательными.

Journal work types reference contract теперь также закрыт end-to-end:
`JournalWorkTypesOut`/`JournalWorkTypeOut` фиксируют required non-null
`success`, `id`, `name` и `weight`, а четыре Web journal consumer-а используют
один generated Tenant DTO вместо трёх расходящихся ручных shapes. Curated gate
фиксирует endpoint/item binding; остальные journal endpoints и общий query cache
этим slice не закрыты.

Journal teacher class-subject picker теперь имеет отдельный nested contract:
`JournalTeacherSubjectsOut`, `JournalTeacherClassOut` и
`JournalTeacherSubjectOut` используются журналом, аналитикой и страницей тем без
`unknown`/`any`/cast. Required nullable `grade_level` и `short_name` закреплены
curated gate; picker props сужены до реально используемых полей без фиктивного
`student_count` или category cast. Query cache и topics CRUD остаются отдельными slices.

Journal topics read path также закрыт отдельно: GET списка возвращает
`JournalTopicsOut`/`JournalTopicOut` с required non-null `id`, `name` и
`order_num`; четыре Web read consumer-а используют generated DTO, а ложный общий
Topic с несуществующим `subject_id` удалён. Read contract не смешивается с
archive/restore receipts и query cache, которые остаются незакрытыми.

Journal topics create/update boundary теперь также typed end-to-end: POST и PUT
принимают закрытые generated `TopicCreate`/`TopicUpdate` и возвращают общий
`JournalTopicOut`; management page больше не дублирует mutation result. Curated
gate фиксирует оба request/response bindings. Archive/restore receipts, lifecycle
policy, versioning/idempotency, offline и query invalidation остаются открытыми.

Journal topic archive/restore success boundary теперь также закрыт: DELETE
возвращает exact `JournalTopicArchiveOut` с `is_archived=true`, restore POST —
`JournalTopicRestoreOut` с `is_archived=false`; оба receipt требуют literal
`detail="ok"` и не принимают request body. Restore path добавлен в curated manifest,
а Web archive consumer использует generated response. Soft-archive policy,
повторные операции, parent-subject conflict, versioning/idempotency и restore UI
не менялись.

Active periods query для teacher analytics теперь typed: `ActivePeriodsOut`
возвращает required nullable `current_period` и список закрытых `ActivePeriodOut`
с ISO `date` boundaries. Web удалил ручные period item/envelope DTO, curated gate
фиксирует refs, required fields и date format. Selection quarter/half-year,
class lookup, admin period CRUD и остальные analytics contracts не изменены.

Teacher analytics topics report query теперь typed end-to-end: GET
`/api/teacher/analytics/topics` возвращает closed `TeacherAnalyticsTopicsOut` с
required `class_avg` и `TeacherAnalyticsTopicOut[]`; item фиксирует required
id/name/avg/bad/total/ratio fields. Analytics page и report generator удалили
ручной неполный DTO. Query construction, period/report_type handling, report
rendering, dashboard/problem-students/works и cache behavior не менялись.

Teacher analytics dashboard GET теперь также typed end-to-end: closed
`TeacherAnalyticsDashboardOut` фиксирует class identity, period boundaries, KPI,
dynamics, shared problem topics и attention students. Все nested schemas required,
non-null и reject extra fields; Web analytics components используют generated
aliases вместо неполных interfaces. Polling/abort/query/period semantics, charts,
report rendering и problem-students/works endpoints не менялись.

Teacher analytics problem-students GET теперь возвращает closed
`TeacherAnalyticsProblemStudentsOut` с required count и full student projection:
id/name/avg/grade counts/problem flag/string issues. Report generation удалил
`any[]` и использует generated response. Existing report `reason` rendering,
classification thresholds, sorting, query/period semantics и works endpoint не
менялись.

Lesson occurrence PATCH теперь возвращает закрытый authoritative
`LessonOccurrenceUpdateOut`: status/date/slot/topic/version receipt используется
Web вместо ручного `{version}` и requested status. Generated request сохраняет
текущую PATCH semantics, а curated gate фиксирует exact fields, required nullable
`topic_id`, lifecycle literals и date. Lock/transfer/conflict policy не менялась.

Journal grade detail GET теперь имеет отдельный закрытый
`JournalGradeDetailOut` с nullable nested subject/student/topic/date fields и
positive version. `ViewGradeModal` больше не применяет широкий legacy `Grade` и
читает authoritative `grade_value`, `grade_type`, `points`; server points снова
видимы. Grade mutations, общий grid DTO и concurrency receipts не закрыты.

Journal grade PUT update теперь также typed end-to-end: existing generated
`UpdateGradeRequest` используется Web, а `JournalGradeUpdateOut` фиксирует required
version/grade/points/diff/balance/color receipt. Curated gate связывает request и
response; current PUT optionality, lock/conflict, refresh lifecycle и calculations
не менялись. Grade create/delete и общий grid остаются отдельными slices.

Journal grade POST create теперь typed end-to-end: `GradeModal` формирует generated
`AddGradeRequest`, а `JournalGradeCreateOut` фиксирует required grade identity,
nullable grade/color/attendance, points/balance и message receipt. Request
optionality/string date и server calculations/validation сохранены. Create version,
delete receipt, grid, idempotency/offline остаются отдельными slices.

Journal grade DELETE теперь возвращает закрытый `JournalGradeDeleteOut` с exact
required `success`/`message` receipt. `ViewGradeModal` принимает generated response,
а curated gate фиксирует response binding, отсутствие request body и обязательный
integer query `version`. Optimistic delete, refund/transaction calculations,
conflict body, toast/refresh lifecycle и offline semantics не менялись.

Friends request lifecycle дополнительно hardened: просроченный `pending` теперь
атомарно переходит в `expired` на create/list/action paths, не показывается и не
может быть принят, освобождает active-pair slot для нового idempotency identity;
privacy-safe telemetry считает только непросроченные pending requests.
Friend-request idempotency также fail-closed проверяет target fingerprint:
повтор одного identity для другого student возвращает `409`. PostgreSQL partial
unique indexes остаются authority для client identity и normalized pending pair;
service после contention rollback возвращает winner exact retry/pair либо bounded
identity mismatch вместо raw `IntegrityError`. Локальный disposable PostgreSQL 15
gate подтвердил same-direction, reverse-direction и conflicting identity races.

**Следующий roadmap:** Tenant scanner worker hardening, Core fail-closed Docker
resource verification/bounded relay и обязательный disposable PostgreSQL 15 CI
gate для `SKIP LOCKED`, stale-worker fencing и destructive migration round-trip
подтверждены зелёным CI run `29691375244`. Добавлен purpose-built relay candidate
gate с constrained Docker check, immutable digest, SBOM/provenance без auto-approval.
Relay candidate evidence: run `29693030308`, digest `sha256:0193187f...92c830`;
это не approval. Для clamd реализована isolated updater topology: updater только в
egress network с RW signature volume, clamd только в internal backend с RO mount;
cold-volume/freshness/EICAR candidate evidence подтверждено run `29695347053`;
disposable recreation persistence и outage/recovery подтверждены run
`29695993596`. Production Tenant freshness parser/gating добавлен в real-Docker
candidate scenario и подтверждён run `29700311274`. Остаются
Bounded 5-school fairness/load подтверждена candidate run `29700812844`. Остаются
approved images и production-like pilot по
[SCANNER_OPERATIONS.md](SCANNER_OPERATIONS.md): собрать digest-pinned images,
проверить PostgreSQL migration, EICAR, network isolation, outage/recovery,
signature updates и node capacity. Только после evidence отдельно проектировать
attachment UI и включение capabilities. Stage F
возобновляется после предоставления
opt-in школы и operator access, Homework conflict QA — после выделения PostgreSQL
concurrency environment и mobile preview QA window. После этого приоритеты
продолжаются по workstream table ниже: Friends/media, учебный hardening, support
escalation, chats/moderation, billing, role parity и production rollout.

**Handoff readiness:** код Stages A-E, automated Stage F gates, durable
support/social read cursors, offline support ticket creation, Friends hardening,
Native Friends UI и двухступенчатый controlled rollout находится в `main`; CI run
[29598407038](https://github.com/syb1v/perum/actions/runs/29598407038) зелёный для
Stage F automation, а последние social/support slices, shared exact support-role,
social/support query plans, versioned telemetry/deployment fixtures/sanitizer и
все 96 consumer-driven curated OpenAPI paths, включая student/parent academic family, main journal aggregate, receipts/import и прежние Friends/Homework/preferences/push/social/support/moderation/teacher/analytics contracts, прошли Core/Tenant full
pytest, mobile/shared/domain tests, contract gates, typecheck и web production build.
Pilot checklist и обязательные поля operator record описаны в
[DYNAMIC_MOBILE_DESCRIPTOR_PLAN.md](DYNAMIC_MOBILE_DESCRIPTOR_PLAN.md). Нельзя
закрывать Stage F без operator evidence или Homework hardening без concurrency и
restart/conflict evidence.

**Handoff остатка:** stop gates и порядок media scanner/native support admin
зафиксированы в [REMAINING_MEDIA_SUPPORT_PLAN.md](REMAINING_MEDIA_SUPPORT_PLAN.md),
итоги последней сессии — в
[SESSION_REPORT_2026-07-18.md](SESSION_REPORT_2026-07-18.md).

**Следующие независимые циклы:**

1. Durable social/chat read cursor: завершён, включая server idempotency,
   account-scoped SQLite, retry/recovery, capability gating и contract tests.
2. Friends hardening: завершён, включая privacy-safe audit/telemetry,
   fail-closed feature flag, pagination/isolation tests и 30-дневное read-only
   окно после school shutdown.
3. Native Friends UI и controlled rollout foundation без attachments: завершены.
   Platform grant, отдельный org enable, revoke reset, desired/applied/observed
   generation и bounded convergence реализованы; production pilot evidence ещё
   не собрано.
4. Node-local ClamAV foundation и Tenant worker/protocol review-hardening
   Core Docker resource verification/bounded relay и PostgreSQL integration gate
   подтверждены. Остаются approved images и production-like Docker/EICAR pilot
   и только затем attachment UI; attachments пока fail-closed.
5. School support native admin inbox functional scope завершён: отдельный
   capability, role-gated cached list/thread, unread summary, online idempotent
   conflict-safe status/category/priority/assignment без optimistic updates.
   Text replies, read cursors и metadata/assignment сохраняются в отдельных
   account-scoped SQLite queues с неизменными
   `client_action_id`/`expected_version`, bounded retry и terminal conflict без
   stale offline chains. Privacy-safe delivery cards/SLA готовы для Tenant outbox
   и typed Core relay endpoint; остаются
   terminal failure policy/exact Core receipts; push ждёт реального delivery adapter.
6. Отложено до назначения профильного владельца: юридические ADR по
   minors/social/parent, retention, offline conflicts, ЮKassa/fiscalization и
   OS/store matrix. Billing, parent observer policy и store rollout не начинаются
   до утверждения соответствующих ADR.

**Протокол обновления:** после каждого завершённого цикла исполнитель обязан
обновить дату, числители/знаменатели, текущий этап, следующий roadmap и handoff;
сверить workstream table; добавить записи в `CHANGELOG.md` и `VERSIONS.md`.
Проценты меняются только при изменении указанной методики или закрытии её пункта.
Новая методика описывается рядом со значением, чтобы ряд оставался проверяемым.
<!-- /LIVE_PROGRESS -->

## 1. Зафиксированные решения

| Область | Решение |
|---|---|
| Друзья | Одноклассники или вся школа, выбирает школа |
| Доступ social по возрасту | Опциональный диапазон классов в админке школы |
| Видимость чатов родителям | Опционально в настройках школы |
| Модераторы | `school_admin` и `director`, одинаковые полномочия |
| Retention сообщений | Опционально в настройках школы в пределах platform policy |
| Ссылки в чатах | Запрещены |
| School admin → PERUM | Через организацию, org admin является обязательным посредником |
| Платёжный провайдер | ЮKassa |
| Тарификация | Число школ + кастомизация оформления школы + кастомизация лендинга |
| Mobile parity | Все роли, включая org/platform admin |
| Offline | Чтение и редактирование с локальным кешем/outbox |
| Магазины | App Store, Google Play, RuStore, Huawei AppGallery |
| ОС | Только актуальные версии; старые версии не поддерживаются |
| Push preview | Показывать отправителя и содержимое, с настройкой отключения |
| Вложения support/social | В первой версии, с защищённым upload pipeline |
| Mobile routing | Один global Core discovery URL; клиент не строит tenant URL самостоятельно |
| Выбор школы | Полный school host, QR/invite link или пара organization domain + school code |
| Публичность школ | Полный список школ организации анонимно не публикуется |
| Social operational rollout | `platform_admin` выдаёт grant, `org_admin` отдельно включает rollout своей школы, `school_admin` управляет tenant policy |
| Social revoke | Platform revoke атомарно сбрасывает org intent; новый grant требует повторного org enable |
| Social convergence | Core discovery закрывается сразу; available node подтверждает env generation свежим heartbeat, unavailable node остаётся `enforcement_pending` |
| Social shutdown retention | Operator shutdown не запускает удаление; school shutdown оставляет read-only историю на 30 дней, re-enable отменяет удаление, moderation hold сохраняет evidence |
| Production media scanner | Один node-local `clamd` на school-hosting node; каждая школа обращается только через свой relay, файлы не покидают node, Core не участвует в data plane |
| Scanner safety | `INSTREAM`, quarantine, fail-closed, signatures максимум 48 часов, минимум 8 ГиБ RAM; capabilities только после EICAR/network pilot |

## 2. Workstreams

### WS1. Учебный контур

1. Разделить `target_occurrence`, дату публикации и deadline ДЗ.
2. Добавить персональный статус выполнения ДЗ.
3. Backfill legacy Grade/Homework/ControlWork в `LessonOccurrence`.
4. Добавить версионирование occurrence и безопасный перенос урока.
5. Архивировать темы/предметы вместо destructive delete.
6. Закрепить optimistic concurrency для offline teacher journal.

### WS2. Friends и direct chats

Полная спецификация: [FRIENDS_CHAT_PLAN.md](FRIENDS_CHAT_PLAN.md).

Порядок:

1. School settings и capabilities.
2. Requests/friendships/blocks.
3. Search и web UI.
4. Conversations/messages/read cursors.
5. Attachments и antivirus/quarantine.
6. Reports/moderation/retention.
7. Polling rollout, затем WebSocket.
8. Native UI, push и offline outbox.

### WS3. Поддержка школы

Tenant хранит переписку пользователей со школой:

```text
student/teacher/parent → tenant support → school_admin/director
```

Таблицы:

- `support_tickets`;
- `support_messages`;
- `support_ticket_participants`;
- `support_ticket_events`;
- `support_attachments`.

API пользователей:

```http
GET/POST /api/support/tickets
GET      /api/support/tickets/{id}
POST     /api/support/tickets/{id}/messages
POST     /api/support/tickets/{id}/read
POST     /api/support/tickets/{id}/close
```

API школы:

```http
GET   /api/admin/support/tickets
GET   /api/admin/support/tickets/{id}
POST  /api/admin/support/tickets/{id}/messages
PATCH /api/admin/support/tickets/{id}
POST  /api/admin/support/tickets/{id}/assign
GET   /api/admin/support/unread-count
```

Web/native:

- FAB поддержки для student/teacher/parent;
- история и thread;
- admin inbox;
- badge, assignment, status, priority, category;
- loading/error/retry/offline outbox;
- вложения сразу, с тем же защищённым media pipeline.

### WS4. School admin → PERUM через организацию

Утверждённый маршрут:

```text
school_admin/director → tenant ticket → org_admin → core support → platform_admin
```

- School admin создаёт запрос эскалации.
- Org admin видит запрос, редактирует/подтверждает и отправляет в core.
- Без подтверждения org admin тикет не покидает организационный контур.
- Ответ platform admin возвращается org admin; org admin отправляет ответ школе.
- Состояния и сообщения синхронизируются через transactional outbox/inbox.
- Core хранит `org_id`, `school_id`, source actor и correlation ID.
- Вложения передаются только после явного подтверждения org admin.

### WS5. Биллинг и тарифы

#### Тарифная формула

```text
monthly_total = school_quantity_price
              + school_branding_package
              + organization_landing_package
              + negotiated_overrides
```

Единицы тарификации:

1. Количество активных школ организации.
2. Кастомизация оформления школ.
3. Кастомизация лендинга организации.

Не использовать число учеников как billable unit. Его можно собирать только для
capacity planning и anti-abuse limits.

#### Каталог

```text
billing_products
- school_slot
- school_branding
- organization_landing
```

```text
billing_prices
- product_id
- currency RUB
- amount_minor
- interval month | year
- effective_from/effective_to
- provider_price_id
- version
```

```text
subscriptions
- organization_id
- status
- current_period_start/end
- cancel_at_period_end
- provider_customer_id/subscription_id
- revision
```

```text
subscription_items
- subscription_id
- product_id
- price_id
- quantity
- metadata
```

Дополнительно:

- invoices;
- payments;
- refunds;
- billing_provider_events;
- organization_entitlement_overrides;
- usage_snapshots;
- entitlement_snapshots.

#### ЮKassa

1. Checkout создаётся только из локального invoice.
2. Используется idempotency key.
3. Redirect/return URL не подтверждает оплату.
4. Webhook проверяется и сверяет сумму, валюту и invoice.
5. Provider event ID уникален; повтор безопасен.
6. Есть reconciliation job и ручной operator fallback.
7. Поддерживаются возвраты и журнал всех переходов состояния.

#### Entitlements

Примеры:

```text
schools.max
school.branding.enabled
school.branding.theme_level
school.branding.custom_domain
organization.landing.enabled
organization.landing.custom_theme
organization.landing.custom_domain
social.enabled
support.attachments.enabled
```

Tenant получает versioned entitlement snapshot и продолжает работу при
временной недоступности core. Существующую остановку school app за просрочку не
развивать и не считать целевой моделью enforcement. До отдельного продуктового,
юридического и операционного решения просрочка не должна автоматически
останавливать учебный контур. Порядок ограничений, grace period, read-only и
восстановления сервиса проектируется отдельно перед реализацией enforcement.

#### UI

Org admin:

- конструктор тарифа по числу школ и опциям оформления;
- ежемесячная/годовая цена;
- checkout ЮKassa;
- счета, платежи, возвраты;
- usage и прогноз;
- отмена/смена пакета.

Platform admin:

- продукты и версии цен;
- подписки и subscription items;
- invoices/payments/provider events;
- receivables, overrides, reconciliation и audit.

### WS6. Общие пакеты web/mobile

```text
packages/
  api-schema       OpenAPI core/tenant + generated types
  api-client       platform-neutral transport/auth/errors/upload
  domain           roles/capabilities/mappers/validation
  query            TanStack query keys/options/mutations
  design-tokens    CSS + React Native tokens
  telemetry        общие event names и redaction
  test-utils       fixtures/factories
```

Web и native не делят JSX/CSS по умолчанию. Они делят контракты, бизнес-логику,
query layer и design tokens.

### WS7. Mobile-ready auth и discovery

```http
GET  CORE   /api/public/tenant-discovery?host={school_host}
POST CORE   /api/public/tenant-discovery
POST CORE   /api/auth/login
POST TENANT /api/login
POST TENANT /api/auth/refresh
POST TENANT /api/logout
GET  TENANT /api/auth/sessions
DELETE TENANT /api/auth/sessions/{id}
GET  TENANT /api/mobile/compatibility
GET  TENANT /api/mobile/capabilities
```

- Short-lived access token в памяти.
- Rotating refresh token в Keychain/Keystore/SecureStore.
- Server-side sessions и revoke.
- Canonical tenant URL только через core discovery.
- Cache namespace включает tenant и user.
- Logout/password reset очищает токены, кеш, outbox и push registration.

#### Каноническая схема входа и маршрутизации

У приложения есть один build-time адрес control plane, например
`https://admin.perum.app`. Это единственный заранее известный backend. Домены
организаций и школ не зашиваются в приложение и не выводятся клиентом из slug.

```text
                         global Core
                    discovery + core auth
                           /        \
          org/platform account      school account
                 Core session       tenant discovery
                                           |
                              https://school.org-domain/api
                                           |
                              tenant session + role routing
```

Поддерживаются три способа найти школу:

1. Полный school host или URL: `school.organization.ru` либо custom domain.
2. QR/invite link, выданный школой: он содержит opaque public school ID или
   одноразовый discovery code, но не credentials.
3. Домен организации + короткий school code. Core разрешает пару серверно и не
   раскрывает анонимному клиенту полный каталог школ организации.

Не использовать глобальный поиск пользователей по логину: одинаковый логин
может существовать в разных tenant-базах, а такой поиск раскрывает membership.
Если пользователь не знает школу, UI предлагает обратиться к школе или
отсканировать её QR-код.

Flow школьного пользователя:

1. Клиент отправляет известный host в существующий
   `GET /api/public/tenant-discovery` либо пару `organization_domain` +
   `school_code`/invite token в новый `POST` того же ресурса.
2. Core нормализует ввод, ищет только active `OrganizationDomain`,
   `Organization`, `School` и `SchoolDomain`, затем возвращает versioned
   discovery response.
3. Клиент проверяет compatibility, сохраняет tenant descriptor и создаёт
   API client с выданным `api_base_url`.
4. Login выполняется непосредственно в tenant через `POST /api/login`.
5. После `GET /api/user/me` роль определяет native navigation. Сессии разных
   школ изолированы и могут храниться параллельно.

Flow `org_admin` и `platform_admin` не проходит через school tenant: login и
дальнейшие запросы остаются в Core. Переключение школы org admin является
выбором контекста управления, а не входом под школьным пользователем.

Discovery response должен содержать:

```json
{
  "tenant_id": "opaque-stable-id",
  "organization_id": "opaque-stable-id",
  "school_id": "opaque-stable-id",
  "organization_name": "Организация",
  "school_name": "Школа",
  "matched_host": "alias.example.ru",
  "primary_host": "school.organization.ru",
  "api_base_url": "https://school.organization.ru/api",
  "web_base_url": "https://school.organization.ru",
  "descriptor_revision": "sha256-content-revision",
  "cache_ttl_seconds": 3600,
  "compatibility": {},
  "capabilities": {}
}
```

`tenant_id`, `organization_id` и `school_id` являются opaque public UUID, а не
последовательными database ID. `matched_host` нужен для диагностики alias,
`primary_host` является каноническим адресом. SecureStore, query cache, outbox,
push registration и telemetry partition key используют `tenant_id + user_id`,
а не hostname: смена домена не должна создавать дубликат аккаунта.

Deep/universal link сначала извлекает public school ID, затем подтверждает
актуальный URL через Core. Нельзя открывать сохранённый tenant URL без
rediscovery, если descriptor устарел. Custom schemes остаются fallback;
основной production-маршрут использует HTTPS Universal Links/App Links на
стабильном platform link domain.

Backend hardening для discovery:

- материализовать primary host каждой школы в `SchoolDomain` и удалить O(N)
  fallback по всем школам;
- учитывать active `OrganizationDomain` при разрешении organization domain;
- добавить public UUID и primary/matched host в response;
- объединить compatibility/capabilities core и tenant в versioned schema;
- ограничить discovery независимым sliding-window лимитом по IP, возвращать
  generic unavailable errors и вести audit без утечки school membership;
- поддержать смену primary domain и rediscovery по stable public ID;
- не передавать tenant access/refresh token в Core, URL или deep link.

### WS8. React Native

Стек: Expo development builds + Expo Router + EAS. Не WebView.

Полный parity включает:

- student;
- parent;
- teacher;
- school_admin/director;
- org_admin;
- platform_admin.

Сложные таблицы реализуются нативными tablet/phone workflows, а не копией
desktop grid. Infrastructure destructive actions требуют step-up authentication,
биометрию и typed confirmation.

#### Offline editing

Обязательный scope:

- persisted read cache;
- SQLite mutation outbox;
- idempotency key каждой мутации;
- entity version/ETag;
- `If-Match`;
- conflict response и conflict resolution UI;
- sync status на каждой редактируемой сущности;
- запрет silent last-write-wins.

Порядок включения offline mutations:

1. Preferences/read states.
2. Social/support messages.
3. Homework student state.
4. Teacher homework/topic edits.
5. Grades и журнал после отдельного conflict QA.
6. Admin operations только там, где операция идемпотентна и безопасна.

### WS9. Push и deep links

- Push preview показывает отправителя и содержимое согласно утверждённому
  требованию.
- Пользователь может отключить preview; school policy может принудительно
  скрывать sensitive categories.
- Payload содержит IDs и минимальный preview; API остаётся источником истины.
- APNs, FCM, RuStore-compatible provider и Huawei Push Kit скрыты за единым
  device/push abstraction.

Deep links:

```text
https://link.perum.app/s/{school_public_id}/schedule
https://link.perum.app/s/{school_public_id}/grades/{id}
https://link.perum.app/s/{school_public_id}/messages/{conversation}
https://link.perum.app/s/{school_public_id}/support/{ticket}
https://link.perum.app/o/{organization_public_id}/billing
https://link.perum.app/platform/support/{ticket}
perum://... (fallback после проверки через Core)
```

### WS10. Магазины и ОС

Поддерживаются:

- Apple App Store/TestFlight;
- Google Play;
- RuStore;
- Huawei AppGallery.

ОС: только актуальные версии на момент старта разработки. Конкретная матрица
фиксируется ADR перед созданием native-проекта и пересматривается ежегодно.
Рекомендуемый baseline на старте: текущая major и две ближайшие поддерживаемые
версии, без legacy Android/iOS. Huawei-устройства без Google services входят в
обязательную device matrix.

## 3. Общий media pipeline

Поскольку вложения нужны сразу и в social, и в support, создаётся один сервисный
контракт:

```text
upload_sessions
media_objects
media_bindings
media_scan_results
```

Flow:

1. Клиент запрашивает upload session.
2. Проверяются role, entitlement, MIME и quota.
3. Файл загружается в object storage.
4. Проверяются checksum, magic bytes и antivirus.
5. До статуса `clean` файл недоступен другим пользователям.
6. Signed URL имеет короткий TTL и object-level authorization.
7. Retention удаляет unbound/quarantined/expired objects.

## 4. Порядок реализации

### Этап 0. ADR и юридические политики, 2–4 недели

- social/parent/moderation policy;
- retention bounds;
- обработка данных несовершеннолетних;
- ЮKassa contract/fiscalization;
- offline conflict policy;
- current OS/store matrix.

### Этап 1. Shared contracts и mobile-ready backend, 6–10 недель

- workspaces и shared packages;
- OpenAPI generation/drift CI;
- platform-neutral client;
- refresh sessions/discovery/devices;
- media pipeline foundation.

### Этап 2. Учебный hardening, 4–8 недель

- Homework semantics;
- occurrence backfill;
- optimistic versions;
- safe lesson transfer;
- offline-ready mutation contracts.

### Этап 3. School support, 6–10 недель

- tenant API/web/native-ready contracts;
- attachments;
- admin inbox;
- notifications/outbox.

### Этап 4. Organization-gated core support, 4–8 недель

- escalation approval org admin;
- core schema и platform inbox;
- bidirectional outbox/inbox.

### Этап 5. Friends, 5–8 недель

- settings, search, requests, blocks, web UI.

### Этап 6. Chats и moderation, 10–16 недель

- messages, attachments, polling/WebSocket;
- reports/cases/actions;
- retention и anti-abuse.

### Этап 7. Billing catalog и ЮKassa, 12–18 недель

- products/prices/items;
- checkout/webhooks/refunds/reconciliation;
- entitlements/snapshots;
- org/platform UI;
- отдельное решение по последствиям просрочки и только затем staged enforcement.

### Этап 8. React Native foundation, 4–6 недель

- Expo/EAS;
- navigation/auth/cache/design system;
- push/deep links/files;
- offline outbox.

### Этап 9. Mobile parity

- Student: 8–12 недель.
- Parent: 4–7 недель.
- Teacher: 12–20 недель с offline journal.
- School admin/director: 10–18 недель.
- Org/platform admin: 8–14 недель.
- Store/security/accessibility hardening: 4–8 недель.

Работы выполняются параллельно несколькими командами; оценки указаны в
календарных неделях для одного основного потока и требуют уточнения после ADR.

### Evidence по workstreams на 2026-07-18

Обозначения: `готово` означает реализованный и проверенный базовый контур;
`частично` означает, что foundation или vertical slice есть, но workstream ещё
не соответствует Definition of Done.

| Приоритет | Направление | Статус | Что осталось |
|---:|---|---|---|
| P0 | Shared contracts | Готово | все tracked actively mounted Web/Mobile consumers используют generated curated schemas или typed shared client; success responses имеют explicit closed models, empty branches shape-complete, aliases переиспользуют owner DTO. Curated manifest/gates покрывают 101 path; internal/unconsumed routes не блокируют consumer-driven DoD |
| P0 | Tenant discovery | Частично, automated-ready | public UUID/host discovery, release manifest, snapshots, compatibility, atomic Mobile descriptor, leases/grace, diagnostics/metrics, rollback success/failure automation и fail-closed evidence collector готовы. Остаются operator Mobile ledger export, зелёный hosted CI актуального pilot commit и реальный opt-in one-school Stage F с deliberate rollback/recovery, telemetry, smoke и signed record; synthetic evidence всегда NO-GO |
| P0 | React Native foundation | Готово, pilot blocked | Expo project `@sybiv/perum` связан, Router/SecureStore/auth/discovery/account routing, validated runtime config, consume-once link/push-tap coordinator, persisted cache allowlist/throttle/logout fencing, durable outboxes, root startup/offline/error shell, typed push boundary, CI exports и pinned EAS preflight готовы. Реальные EAS/signing/provider credentials, remote build environment, domain associations, signed Android/iOS builds и physical-device push/link evidence остаются внешними pilot/integration blockers |
| P0 | Юридические ADR | Отложено | требуется профильный владелец: minors/social/parent policy, retention, offline conflicts, ЮKassa/fiscalization, OS/store matrix; зависимые billing, parent observer policy и store rollout не начинать |
| P1 | Учебный hardening | Частично | optimistic locking Grade, version-safe LessonOccurrence/safe transfer, preview/token-gated occurrence backfill и soft archive Subject/Topic готовы. Ambiguity report имеет typed OpenAPI contract, server-enforced report acknowledgement и Web safe-only apply/refresh flow; direct POST не может обойти просмотр текущего report. Homework разделён на assigned/target occurrence, publication/deadline и versioned student state с web/mobile outbox; list/state receipt теперь typed в Pydantic/OpenAPI, Mobile fail closed исключает role-shaped rows без student state. Остаётся расширенный conflict QA; multi-device QA временно отложен до готовности concurrency environment и preview window |
| P1 | Friends | Частично | durable social cursor, hardening, Native Friends UI и двухступенчатый platform grant → org enable rollout foundation готовы; revoke сбрасывает org intent, discovery fail-closed учитывает desired state, convergence подтверждается generation heartbeat. Stale requests fail-closed переходят в `expired`; idempotency target mismatch даёт `409`, а PostgreSQL same/reverse-pair и identity contention возвращают authoritative winner/bounded conflict без duplicate pending/audit. Остаются production pilot evidence, attachments, push и дальнейший anti-abuse после утверждения policy/thresholds |
| P1 | Media pipeline | Частично | PostgreSQL run `29691375244` подтвердил concurrency/migration. Candidate run `29700812844` подтвердил cold signatures, isolation, persistence/outage, production Tenant stale recovery и bounded 5-school fairness (`MAX_CONNECTIONS=2`, burst `6×1 MiB`, concurrent peers, exact resource inspect). Это candidate envelope, не production sizing. Exact digests остаются candidate. Остаются operator review, target-node inspect/load pilot и attachment UI; production attachments fail-closed |
| P1 | School support | Частично | text-only tickets/messages/shared read, notifications, assignment, version-safe metadata, audit history, web requester/admin UI, native requester durable outboxes и offline ticket creation готовы. Requester и admin metadata/assignment/reply/read/escalation API payloads используют generated schemas со stable Mobile identities и backward-compatible Web read path. Organization reply атомарно создаёт tenant-scoped in-app notification только активным school admin/director, dedup-ится Core receipt и закрывается read cursor отдельно для каждого оператора. Web bell открывает authoritative ticket по typed reference/shareable URL. Native school admin/director получил cached support/notification inboxes, exact routing, durable queues, privacy-safe escalation request, delivery/SLA/DLQ card и manual recovery. Остаются attachments и реальный push delivery/tap evidence |
| P1 | Core support escalation | Частично | explicit redacted school request, durable bounded tenant outbox, idempotent Core intake, org approval/rejection, platform visibility gate и privacy-safe relay pull/ack готовы. Exact closed receipts fail closed до local mutation; terminal 4xx/8-attempt policy, DLQ recovery, typed delivery endpoints, dashboards, terminal-failure telemetry, unlabeled Prometheus gauges и validated alert rules/local Alertmanager закрывают repository reliability contour. Остаются approved external contact-point delivery evidence и native org/platform parity |
| P2 | Chats/moderation | Частично | 1:1 student text chats, durable read state, offline outbox, reports, evidence-scoped moderation/audit, operational shutdown, retention и foreground WebSocket realtime с polling fallback готовы. Mobile send/read/report payloads и moderation inbox/detail/action receipt используют curated generated schemas; Web использует generated moderation types и optimistic version receipt. Остаются groups, parent observer policy, attachments и расширенный anti-abuse |
| P2 | Billing/ЮKassa | Не начато | catalog, checkout/webhooks, refunds/reconciliation, entitlements и org/platform UI; остановку school app не развивать, enforcement спроектировать отдельно позже |
| P2 | Push/deep links | Частично | deep-link parser/rediscovery/routing/association routes, proof-of-possession installation, encrypted account registration, session revoke integration, privacy-safe suppressed outbox, Expo permission/token rotation/tap lifecycle готовы; остаются link DNS/signing identifiers, server encryption keys, EAS credentials и реальные Expo/APNs/FCM/RuStore/Huawei delivery adapters |
| P2 | Mobile role parity | Частично | student vertical slices Homework, Friends, Messages и Support requester готовы; school admin/director получили support inbox foundation. Остаются полный student parity, parent, teacher offline journal, остальные school admin/director и org/platform admin workflows |
| P3 | Production rollout | Не начато | security/accessibility/device matrix, stores, pilots, staged flags, metrics и rollback runbooks |

Live sequence и handoff не дублируются здесь: они редактируются только в блоке
`Live progress` в начале файла. Таблица выше хранит evidence и remaining scope по
workstreams; исполнимая матрица текущего Stage F находится в
[DYNAMIC_MOBILE_DESCRIPTOR_PLAN.md](DYNAMIC_MOBILE_DESCRIPTOR_PLAN.md).

## 5. CI и release gates

Обязательные проверки:

- core/tenant pytest;
- PostgreSQL и SQLite migration smoke;
- cross-school/cross-org RBAC matrix;
- OpenAPI drift;
- web typecheck/build/Playwright;
- mobile typecheck/unit/Maestro;
- Android/iOS preview builds;
- webhook idempotency/reconciliation;
- offline conflict tests;
- push/deep-link cold start;
- attachment MIME/malware/quarantine;
- accessibility и low-end device tests;
- secret/dependency/security scanning.

Production rollout:

1. Feature flags выключены по умолчанию.
2. Internal test org/school.
3. Несколько пилотных школ.
4. Наблюдение за abuse, billing и sync metrics.
5. Поэтапное включение.
6. Store staged rollout.
7. Runbook rollback/reconciliation для каждого workstream.

## 6. Definition of Done

Функция не считается готовой, пока нет:

- миграции и rollback/compatibility strategy;
- service-level authorization;
- OpenAPI и generated types;
- web и native UI либо явного approved platform exception;
- loading/error/empty/offline/conflict states;
- audit и observability;
- automated tests;
- manual role matrix;
- feature flag и rollout plan;
- документации поддержки и incident runbook.
