# Журнал изменений

Все заметные изменения в проекте PERUM (новая архитектура). Формат вдохновлён [Keep a Changelog](https://keepachangelog.com/ru/), даты в формате ГГГГ-ММ-ДД. Свежие версии — сверху.

> Проект на стадии активной разработки (`0.0.x`) — закладываем фундамент новой архитектуры (silo-per-SCHOOL: каждая школа — отдельный стек, школы — дети организации; + control plane). Учебные, социальные и мобильные вертикали активно реализуются по [docs/PRODUCT_MASTER_PLAN.md](docs/PRODUCT_MASTER_PLAN.md).

## [Unreleased] — 2026-07-22

- Tenant GET `/api/journal/grades/{grade_id}` получил закрытый `JournalGradeDetailOut` с отдельными nested subject/student schemas и required nullable wire fields. `ViewGradeModal` удалил несовместимый широкий `Grade`, legacy aliases и использует authoritative `grade_value`/`grade_type`/`points`; возвращаемые server points снова отображаются. Grade mutations/grid/concurrency scope не заявляется готовым.
- Tenant PATCH `/api/journal/lesson-occurrences/{occurrence_id}` получил закрытый `LessonOccurrenceUpdateOut` с authoritative status/date/slot/topic/version receipt. Web использует generated request/response и устанавливает server status вместо requested value; curated gate фиксирует exact fields, required nullable `topic_id`, lifecycle literals и date format без изменения optimistic-lock, transfer или conflict semantics.
- Tenant `GET /api/periods` получил закрытые `ActivePeriodsOut`/`ActivePeriodOut` response schemas: `current_period` required nullable, periods/items required, даты имеют OpenAPI `format: date`. Teacher analytics удалил ручные period DTO и использует generated contract; selection quarter/half-year, class lookup и admin period CRUD не менялись.
- Journal topics POST create и PUT update получили закрытые generated `TopicCreate`/`TopicUpdate` requests и общий `JournalTopicOut` response. Management page удалил локальный mutation result и использует generated payload/receipt; curated gate фиксирует четыре bindings. HTTP 200 и текущая бизнес-семантика сохранены, archive/restore/versioning/offline scope не заявляется готовым.
- Tenant GET `/api/journal/subjects/{subject_id}/topics` получил закрытые `JournalTopicsOut`/`JournalTopicOut` read schemas. Четыре Web consumer-а используют generated DTO вместо двух расходящихся Topic shapes; удалён ложный общий `subject_id`, curated gate фиксирует required non-null `id`/`name`/`order_num`. POST/PUT/archive/restore намеренно остаются отдельной mutation boundary.
- Tenant `GET /api/journal/teacher/subjects` получил закрытый nested contract `JournalTeacherSubjectsOut`/`JournalTeacherClassOut`/`JournalTeacherSubjectOut`. Журнал, аналитика и страница тем используют generated DTO вместо `unknown`/`any`/casts; required nullable `grade_level`/`short_name` закреплены curated gate, а picker props сужены до фактически используемых полей без подделки legacy `ClassInfo`/`Subject`.
- Tenant `GET /api/journal/work-types` получил закрытые `JournalWorkTypesOut`/`JournalWorkTypeOut` schemas с required non-null envelope и item fields. Четыре Web journal consumer-а переведены с трёх расходящихся ручных response shapes на один generated DTO; curated gate фиксирует endpoint/item binding и обязательный `weight`, не расширяя slice до journal query/cache refactor.
- Tenant `GET /api/teacher/homework` получил отдельные закрытые `TeacherHomeworkListOut`/`TeacherHomeworkOut` schemas для profile feed без смешения с расширенным `/api/homework`. Web удалил ручные `ActivityItem`/response DTO и двойной cast, а nullable date/class/subject metadata теперь отображаются явно; curated gate фиксирует binding, required fields и nullability.
- Tenant `GET /api/teacher/classes` получил закрытые `TeacherClassesOut`/`TeacherClassOut` response schemas с required nullable `created_at`. Web удалил ручную копию DTO и двойной `unknown` cast; curated gate фиксирует endpoint/item binding, required fields и date-time nullability. Остальные teacher endpoints и query families остаются отдельным scope.
- Mobile admin support metadata/assignment/reply/read paths связаны с generated `TicketPatch`, `AssignCreate` и support `MessageCreate`/`ReadCreate`. Action union больше не принимает произвольные metadata strings, UI сохраняет generated literals до durable enqueue, curated gate фиксирует четыре operator request bindings и action/version identities. Native escalation и Core terminal receipts не входят в slice.
- Mobile requester support ticket/reply/read outboxes переведены на generated `TicketCreate` и support `MessageCreate`/`ReadCreate`. Curated gate фиксирует POST request bindings, required identities и optional read `client_action_id` для backward-compatible Web reads; pure mapper test гарантирует, что durable Mobile replay всегда переносит stable ticket/message/action IDs. Admin action request family остаётся отдельным scope.
- Mobile social send/read outboxes переведены на generated `MessageCreate`/`ReadCreate`, report сохраняет generated `ReportCreate`. Curated gate связывает три POST endpoints с request schemas и required identities, pure mapper test фиксирует перенос immutable `client_message_id`/`client_action_id` без изменения retry identity; groups/attachments/push scope не заявляется готовым.
- Push registration GET/PUT/DELETE получили отдельные Pydantic/OpenAPI response schemas и generated Mobile aliases. Исправлено восстановление Native UI после перезапуска: active state определяется по nullable `registration`, а не по отсутствующему в Tenant response полю `registered`. Curated gate и pure test не смешивают registration receipt с `delivery_enabled=false`; provider delivery/credentials/tap lifecycle остаются pending.
- Mobile preferences переведены с ручного network DTO на generated `PreferencesResponse`/`PreferencesPatch`. Tenant PATCH route теперь объявляет фактически возвращаемый response model вместо OpenAPI `unknown`; regenerated snapshot и curated gate фиксируют GET/PATCH response, PATCH request и required fields, не смешивая client-owned outbox state с API schema.
- Tenant deployment snapshot sender и Core strict consumer связаны versioned `deployment_snapshot.v1.json`: fixture фиксирует exact fields, schema version, strict readiness booleans, social generation, timezone-aware observation и extra-field rejection. Это automated contract parity без claims о Mobile telemetry proof, rollback или Stage F pilot.
- Core telemetry ingest больше не сохраняет произвольный authenticated `metrics` dict: versioned `school_metrics.v1.json` связывает Tenant exporter и Core allowlists, sanitizer оставляет только finite non-negative scalar aggregates и exact social/scanner/support sections. Unknown top-level data отбрасывается, malformed/extended nested section исключается целиком, heartbeat compatibility сохраняется без claims о Mobile telemetry evidence.
- Добавлен versioned cross-component fixture для support escalation delivery telemetry: Tenant exporter и Core parser проверяют один exact four-field aggregate contract и healthy/warning/critical semantics. Core исправлен на fail-closed rejection дополнительных ключей, включая identifier-подобный `school_id`; malformed/extended payload становится unknown, fixture не содержит production coordinates или user data.
- Mobile requester/admin support cache invalidation переведён на раздельные account-scoped query plans. Requester operations не затрагивают operator cache, admin action/conflict/reply/read обновляют unread, thread инвалидируется только после reply, а redundant detail calls удалены в пользу TanStack tickets-prefix semantics; isolation закреплена pure tests.
- Mobile social cache invalidation объединён в account-scoped query plans для reconnect, realtime events и durable send/read success. Ручной broad messages key удалён; offline read cursor replay теперь также обновляет unread count, а pure tests запрещают cross-account и support/Homework cache invalidation.
- Tenant social moderation inbox, evidence detail и action receipt получили раздельные privacy-minimized Pydantic/OpenAPI schemas; Web удалил ручные case/evidence DTO и использует generated contracts. Contract gate фиксирует endpoint bindings, nullable cursor, evidence whitelist и optimistic version receipt, не расширяя доступ к содержимому сообщений.
- Tenant Homework list и versioned state receipt получили typed Pydantic/OpenAPI responses; Mobile заменил ручные server DTO на generated schemas. Student decoder fail closed отбрасывает role-shaped rows с `student_state=null`, а contract gate фиксирует endpoint bindings и обязательные version/replay fields без claims о завершённом multi-device QA.
- Friends Web/Mobile переведены с ручных student/page/request/block DTO на generated Tenant OpenAPI schemas. Contract gate теперь проверяет точные social endpoint-to-schema bindings, обязательные client fields и required nullable integer `next_cursor`, предотвращая незаметный drift pagination и expiry/block shapes при регенерации.
- School support role boundary вынесен в shared `@perum/domain`: Web notification routing, Native support inbox/Home и Mobile notification resolver используют один exact helper для `school_admin`/`director`. Отдельный domain contract test гарантирует, что legacy роль `admin` не получает support operator access, не изменяя более широкую общую school-admin policy.
- Native school admin/director получил cached in-app notification inbox с unread count и clickable переходом по exact `admin_support_ticket` в authoritative support ticket. Tenant notification contract теперь typed в Pydantic/OpenAPI; read подтверждается сервером до удаления из списка, а unknown reference, неподходящая роль/capability и transport failure не запускают navigation. Push delivery и tap lifecycle остаются выключенными до реального adapter/credentials.
- Web-панель школьного администратора получила notification bell с автообновлением, badge, очисткой и actionable переходом по typed `admin_support_ticket` reference. Клик отмечает только выбранное уведомление прочитанным и открывает authoritative support ticket по shareable URL, включая refresh и тикеты вне первой страницы очереди.
- Tenant relay pull теперь в одной транзакции с materialized organization reply создаёт durable in-app notifications для активных `school_admin`/`director` только той же школы. Core message receipt сохраняет replay idempotency без повторного fan-out, а admin read отмечает прочитанным только notification текущего оператора; typed `admin_support_ticket` reference готов для последующего clickable Web/Mobile routing.

## [Unreleased] — 2026-07-21

- Friend-request idempotency теперь fingerprint-ит target student: exact retry возвращает historical row, а reuse одного `client_request_id` для другого target даёт deterministic `409`. Service восстанавливается после PostgreSQL client/pair unique-index contention через authoritative winner lookup; disposable PostgreSQL 15 tests покрывают same-direction, reverse-direction и conflicting identity races без duplicate pending/audit или raw `IntegrityError`.
- Native school support admin read cursor получил отдельный durable account-scoped SQLite outbox: offline observation, immutable `client_action_id`, exact dedup, crash recovery, bounded retry, capability pause, logout isolation и visible unsynced/permanent state с explicit retry. Requester/admin endpoints и stores разделены; opaque message IDs не сортируются клиентом, monotonic cursor остаётся authoritative на Tenant.
- Native school support admin text replies получили отдельный durable account-scoped SQLite outbox: offline enqueue, immutable `client_message_id`/body, FIFO per ticket, crash recovery, bounded retry, capability pause и logout cleanup. Pending/permanent-failure bubbles видимы в thread, успешный authoritative response обновляет thread/detail/list/unread; admin/requester endpoints и storage не смешиваются. Read cursor был закрыт следующим отдельным slice выше.

## [Unreleased] — 2026-07-18

- Friend-request expiration lifecycle теперь enforced сервером: stale `pending` атомарно становится `expired` на create/list/action paths, late accept/reject/cancel возвращает non-disclosing 404, historical idempotency replay остаётся deterministic, а новый request identity может занять освобождённый normalized-pair slot. Social telemetry исключает просроченные requests из active pending count.
- Native school support admin metadata/assignment получили durable account-scoped SQLite outbox: offline intent сохраняет исходные `client_action_id` и `expected_version`, transient failures используют bounded retry/crash recovery, а `409` становится terminal visible conflict с server refetch. На один ticket допускается только одна незавершённая mutation, поэтому stale offline chains невозможны; reply/read остаются online-only.
- Occurrence backfill ambiguity report получил server-enforced SHA-256 acknowledgement: при спорных группах direct apply без текущего `ambiguity_token` отклоняется до writes, а Web отправляет token только после явного safe-only confirmation и перезагружает report при conflict. Preview/apply responses описаны typed Pydantic/OpenAPI models.
- Добавлен bounded 5-school scanner fairness gate: отдельная network/relay на школу, `MAX_CONNECTIONS=2`, burst `6×1 MiB`, concurrent peer scans, bounded deadlines и real inspect resource/network/no-mount assertions. Gate не выдаётся за production throughput benchmark до target-node load pilot.
- Bounded multi-school fairness подтверждён run `29700812844`; exact clamd/relay digests записаны только как candidates, без production sizing или target-node claims.
- Real-Docker scanner gate запускает production Tenant `ClamAVScanner` для stale-signature fail-closed/recovery: strict `0h` policy требует `stale_signatures`/`unavailable`, штатная `48h` policy на том же real VERSION header требует ready, clean и EICAR infected. Filesystem mtime не используется как подмена signature timestamp.
- Production Tenant freshness harness запускается из image `/app`, чтобы импортировать фактический packaged `app.modules.media.scanner`; scanner implementation и assertions не дублируются.
- Production stale-signature fail-closed/recovery подтверждён real-Docker run `29700311274`: real VERSION timestamp, strict `0h` unavailable и штатный `48h` ready/clean/EICAR; новые exact digests остаются candidates.
- Scanner Docker candidate gate расширен recreation/outage evidence: SHA-256 fingerprint signature volume до/после clamd recreation, scanning при updater outage, fail-closed relay request при clamd outage, повторные clean/EICAR и exact mount/tmpfs/network inspect после recovery.
- Recreation/outage scanner evidence подтверждён run `29695993596`; новые exact clamd/relay digests записаны только как candidates, без operator approval или target-node claims.
- Реализована least-privilege ClamAV updater topology: freshclam только в отдельной egress network с RW signature volume, clamd только во внутренней scanner network с RO mount. Candidate workflow проверяет cold empty-volume initialization, freshness, exact isolation и clean/EICAR через constrained relay перед immutable GHCR publication с SBOM/provenance; до зелёного run/explicit review это не approved image.
- Cold-volume candidate readiness ждёт полный валидный `main` + `daily` ClamAV database set вместо первого появившегося файла; при timeout workflow сохраняет fail-closed state/log diagnostics.
- Clamd candidate включает отдельный `clamav` CLI package и до topology tests проверяет наличие `clamscan`, `clamdscan` и `freshclam`; это устраняет ложный readiness timeout после уже успешной загрузки и встроенной проверки signatures.
- Clamd candidate явно устанавливает Debian package `clamdscan`, который не входит в `clamav-daemon`; обязательная binary-presence проверка сохранена.
- ClamAV binary preflight использует `command -v`: `clamdscan` не запускается до daemon startup, а его функциональность отдельно подтверждается health/protocol gate после запуска.
- Clamd stream limit использует поддерживаемый directive `StreamMaxLength`; daemon startup logs направлены в stderr, чтобы config/runtime failures не оставались без диагностики.
- Clamd foreground config не задаёт symlink `/dev/stderr` как LogFile: ClamAV secure-open отклоняет его; Docker process output и harness state/log diagnostics остаются источником startup evidence.
- Scanner candidate protocol gate разделяет clean и EICAR verdict assertions и при ошибке показывает только public test response, не содержимое production payload.
- Scanner topology gate сначала проверяет direct-backend clean control, затем те же clean/EICAR запросы через relay; mismatch включает только relay process logs и public test response.
- Candidate protocol client читает null-terminated ClamAV response через bounded `readuntil`, точно как production scanner adapter, вместо ожидания connection EOF.
- Real-Docker scanner harness при non-zero command сохраняет stdout/stderr disposable public-test container, устраняя непрозрачные protocol failures без логирования production payload.
- Clamd candidate gate проверяет `zVERSION` control перед INSTREAM и прикладывает daemon logs только при disposable direct-stream failure, не меняя production protocol без server evidence.
- Read-only clamd получает единственный bounded writable `/tmp` tmpfs (`16m`, `noexec`, `nosuid`) для INSTREAM temporary data; Core fail-closed сверяет exact tmpfs, signature volume остаётся read-only.
- Paired scanner candidates подтверждены run `29695347053`: cold signatures, updater/backend isolation, constrained clamd/relay, direct clean и relay clean/EICAR, immutable digest inspection и SBOM/provenance. Digests остаются candidate; recreation persistence и operator approval не заявлены.
- Добавлен purpose-built scanner relay candidate workflow: constrained Docker contract, non-root/read-only/cap-drop/no-new-privileges/PID/resource checks, immutable GHCR tag, SBOM, provenance и candidate digest artifact без auto-approval. Core reconciliation дополнительно проверяет command/environment/running/restart/privileged/cap-add/health drift. Clamd publication заблокирована до signature updater design для internal network.
- Relay candidate workflow использует registry-native BuildKit SBOM/provenance и post-push exact digest inspection вместо недоступного GitHub Attestations API для user-owned private repository; failed run digest не принимается как evidence.
- Relay candidate handoff больше не приписывает OCI index digest единственную platform: BuildKit provenance/SBOM добавляют attestation manifests, поэтому artifact сохраняет только проверенный exact image digest и source commit.
- Purpose-built relay candidate подтверждён зелёным workflow run `29693030308`; exact digest записан только как `candidate`, без operator approval или scanner activation.
- CI получил отдельный disposable PostgreSQL 15 scanner gate: реальный two-session `SKIP LOCKED`, expired-lease replacement со stale-worker fencing и Alembic `0036→0037→0036→0037` round-trip с проверкой schema/index/base rows и явной потерей scanner metadata при destructive downgrade; production credentials не используются.
- Tenant migration `0028` расширяет `alembic_version.version_num` до 64 символов до записи длинного revision ID; это устраняет обнаруженный PostgreSQL-only blocker полного migration chain, который не проявлялся в SQLite smoke.
- PostgreSQL scanner gate разделяет migration baseline evidence и чистый concurrency fixture, чтобы stale-worker assertion учитывал только verdict winner и не принимал заранее посеянный migration result.
- PostgreSQL scanner migration/concurrency gate подтверждён полным зелёным CI run `29691375244` (`2 passed`); Docker/ClamAV/EICAR pilot остаётся отдельным незакрытым этапом.
- Core scanner provisioning теперь fail-closed отклоняет drift existing network/clamd/relay по pinned image, topology, mounts, ports, capabilities, resources, health и security settings; per-school relay получил non-root/read-only/no-new-privileges/PID hardening и connection/idle/total/byte limits. Реальный Docker/EICAR pilot по-прежнему обязателен.
- Tenant scanner прошёл review-hardening: добавлены total scan deadline, bounded ClamAV evidence и future-signature rejection, lease-token/expiry fencing перед verdict, cleanup exclusion активных leases, deterministic recovery clean move после crash и удаление infected content только после durable DB verdict; attachment capabilities остаются выключенными до Core relay/Docker hardening и реального pilot evidence.
- Platform/org dashboards получили bounded support delivery status и явный `unknown` для stale/missing/malformed telemetry; Core экспортирует шесть unlabeled Prometheus gauges и исправляет populated-school `/metrics` liveness path. Notification routing не заявляется настроенным без Alertmanager/contact-point evidence.
- Добавлена privacy-safe delivery observability поддержки: Tenant outbox публикует admin-only `pending/retrying/delivered`, attempts, durations и SLA, Mobile показывает cached delivery card, aggregate telemetry не содержит IDs/content, а typed Core relay endpoint выводит `pending/delivered` по ACK cursor; несуществующий terminal `failed` не симулируется.
- Native school support admin inbox получил conflict-safe управление status/category/priority/assignment: Tenant возвращает `assignee_id`, изменения публикуются только после authoritative versioned response, idempotency key стабилен при retry, а `409 VERSION_CONFLICT` обновляет server snapshot без optimistic overwrite.
- Добавлен foundation Native school support admin inbox: отдельный `support_admin` descriptor capability, role-gated account-scoped cached list/thread, unread/urgent/unassigned summary и idempotent online reply/read для `school_admin` и `director`; requester privacy boundary сохранена, attachments и push не включены.
- Добавлен privacy-safe foundation для Stage F descriptor pilot: общий Core resolver сохраняет fail-closed social rollout generation gates, operator diagnostics возвращает только bounded readiness, метрики используют фиксированные reason labels, Mobile ведёт ограниченный локальный ledger, а synthetic collector всегда остаётся `NO-GO`; production pilot по-прежнему не закрыт.
- Утверждён и реализован fail-closed foundation node-local media scanner: один общий ClamAV на school-hosting node, отдельный dual-homed relay для каждой школы, потоковый `INSTREAM` без доступа scanner к школьным volumes, immutable scanner images, минимум 8 ГиБ RAM и signatures не старше 48 часов.
- Media worker переведён с process-local списка попыток на durable DB leases, retries/backoff и scanner evidence; readiness и backlog передаются без PII. Attachment capabilities не включены: production activation заблокирована реальным EICAR, Docker network-isolation, PostgreSQL migration и operational pilot.
- Подготовлена передача scanner-цикла: `REMAINING_MEDIA_SUPPORT_PLAN.md` содержит точную точку остановки и порядок завершения, а `SCANNER_OPERATIONS.md` фиксирует topology, требования и обязательные pilot gates.

## [Unreleased] — 2026-07-17

- Product master plan полностью синхронизирован с состоянием на 2026-07-18: обновлены live/evidence даты, social rollout/retention решения, handoff evidence, Mobile role parity и консервативная общая готовность `28–33%` без изменения незакрытых Stage F descriptor-шкал.
- Подготовлена передача оставшихся циклов: отдельный план фиксирует выбор production scanner, attachment stop gate и независимый native support admin inbox, а session report суммирует реализованные support/social/rollout изменения и зелёные проверки.
- Реализованы Native Friends UI и двухступенчатый controlled social rollout: `platform_admin` выдаёт grant, `org_admin` отдельно включает свою школу, revoke атомарно сбрасывает org intent; Core немедленно закрывает discovery capabilities, typed local/remote app swap применяет env с generation fencing и rollback, а fresh heartbeat подтверждает bounded convergence без ложного `converged`.
- Friends/social hardening разделил fail-closed operator rollout и школьную policy: school shutdown оставляет историю read-only на 30 дней с пользовательским countdown и отменой удаления при повторном включении, operator shutdown не запускает deletion; добавлены audit/telemetry, capability gating, pagination/isolation hardening и исправление пропуска search cursor.
- Direct chats получили durable account-scoped read cursor: tenant атомарно хранит монотонный cursor и actor-wide idempotency receipt, mobile восстанавливает SQLite outbox после crash/network failure и использует отдельную release capability `offline_social_read_cursors`, не смешивая rollout с support cursor.
- Юридические ADR вынесены из активной очереди до назначения профильного владельца; зависимые billing, parent observer policy и store rollout остаются заблокированными, а отдельная ссылка на deferred requirements убрана из индекса документации.
- Требования для возобновления Stage F pilot и Homework multi-device conflict QA вынесены в отдельный active document с prerequisites, stop conditions и exit criteria; master plan получил следующий dependency-aware roadmap из шести малых циклов.
- Master plan переоценён после двух durable support slices: Stage F pilot и Homework multi-device QA оставлены незакрытыми и явно отложены до внешнего evidence, а следующим изолированным циклом выбран durable social/chat read cursor без изменения продуктовых процентов.
- Mobile requester может создать school support ticket офлайн: immutable client IDs и payload сохраняются в account-scoped SQLite до отправки, retries и crash recovery не создают дублей, persisted local-to-server reconciliation переводит optimistic карточку на реальный thread, а permanent failure остаётся доступен для безопасного повтора.
- Mobile requester support получил durable account-scoped SQLite read cursor: стабильный `client_action_id`, crash recovery, bounded retry, capability downgrade guard и logout isolation; tenant дедуплицирует потерянные ответы, сохраняет монотонность cursor и совместимость online web-клиентов.
- Для последней строки Stage F подготовлен безопасный one-school pilot checklist: prerequisites, unknown-release/grace/incompatible-client сценарии, stop/recovery criteria и privacy-safe шаблон operator evidence; шкала сохранена на 11/12 до фактического пилота.
- Stage F dynamic descriptor получил request-time traffic lease и lifecycle scheduler: cold start, resume после TTL, account switch и release upgrade/downgrade синхронно закрывают старые clients до atomic descriptor acceptance; refresh rotation стал persistence-first, добавлены automated lifecycle/Core transition tests и обязательный Tenant release descriptor contract gate перед image publication.
- OpenAPI generator корректно разрешает bare `python` через `PATH` в clean CI и автоматически использует service venv локально, устраняя ложный repository path `<root>/python` и позволяя одной команде воспроизводить contract drift gate.
- Stage F automated release evidence подтверждено полностью зелёным CI run `29598407038`: descriptor contract gate, Core/Tenant tests, OpenAPI drift, Web build и Mobile Android/iOS exports прошли; до закрытия Stage F остаётся one-school pilot.
- Документация сведена к единой актуальной модели silo-per-SCHOOL: `PRODUCT_MASTER_PLAN.md` стал единственным live status/roadmap с редактируемой методикой прогресса и handoff, operational/architecture guides переписаны по текущему коду, dated plans/audits/reports перенесены в `docs/archive`, а дублирующие deployment/OTA/tariff документы удалены.
- Mobile атомарно сохраняет полный tenant descriptor v1 с account-scoped capabilities, проверяет schema/API/SemVer до authenticated traffic и ограничивает last-known-good fallback 24 часами только для network/429/5xx; direct routes, background providers и durable outboxes fail-closed учитывают capability downgrade без удаления pending mutations и idempotency identity.
- Tenant получил strict canonical `GET /api/mobile/descriptor` с теми же schema version, compatibility и curated capabilities, что Core discovery; build contract загружается из release-owned manifest, runtime readiness разделяется с telemetry, legacy mobile endpoints сохранены как typed projections, а structural OpenAPI check блокирует schema drift.
- Core принимает аутентифицированный versioned deployment snapshot школы, проверяет UUID, release identity и монотонность наблюдения, а tenant discovery публикует deployment-dependent capabilities только как пересечение release manifest со свежей runtime readiness; missing/stale snapshot и недоступный scanner обрабатываются fail-closed и фиксируются безопасной structured telemetry.
- Core tenant discovery теперь получает versioned mobile compatibility и capabilities из release manifest, включает их в content revision и при отсутствии, неизвестном или невалидном manifest безопасно отключает все mobile capabilities.
- Синхронизирован `PRODUCT_MASTER_PLAN.md` и детальный план dynamic mobile descriptor: на момент записи release manifest и Core resolver были отмечены выполненными; последующие записи этой секции закрыли deployment snapshot, tenant parity и mobile grace, Stage F lifecycle gates остаётся незакрытым.
- Core release records now persist a strict, versioned mobile manifest; the CI release endpoint requires it and the tenant workflow publishes the repository-owned descriptor with every release.
- Подготовлена техническая передача по последнему инженерному циклу: Homework и offline conflicts, occurrence backfill, архивирование учебных сущностей, discovery/mobile auth, security, CI, миграции и порядок продолжения.
- Подготовлен краткий отчёт для команды о текущей готовности PERUM, состоянии кабинетов ученика, учителя и родителя, архитектуре и реалистичности достижения feature complete ко второй неделе августа.
- Mobile проверяет TTL и API-совместимость tenant descriptor до любого authenticated запроса при cold start и переключении аккаунта, обновляет routing через Core с tenant identity pinning и использует last-known-good descriptor при временной недоступности Core; rotating refresh больше не мутирует замыкание аккаунта до атомарного сохранения токена.
- Сформирован исполнимый план динамического versioned mobile descriptor: release manifest в Core вместо live tenant query, безопасное пересечение deployment capabilities, tenant contract parity, mobile feature gating и 24-часовой grace period для last-known-good routing.

## [Unreleased] — 2026-07-16

- Core discovery-контракт и generated-схемы публикуют content revision и TTL descriptor-а; новые mobile accounts сохраняют school UUID и routing metadata, а фоновая rediscovery после expiry обновляет endpoint без повторного login с сохранением последнего рабочего адреса при недоступности Core.
- Публичный tenant discovery ограничен независимым sliding-window лимитом по клиентскому IP для GET и POST, с `429` и `Retry-After` при исчерпании лимита.
- Tenant discovery разрешает пару organization-domain/school-code через активные aliases `OrganizationDomain`, без обращения к устаревшему каноническому полю организации.
- Homework version conflict унифицирован между tenant, web и mobile: `409 VERSION_CONFLICT` всегда содержит актуальный server snapshot, первый конкурентный переход не теряется, web восстанавливает состояние с явным сообщением, mobile сохраняет конфликт для выбора пользователя.
- Mobile Homework получил явное разрешение version conflicts: backend возвращает актуальное server state, SQLite хранит конфликт, а ученик выбирает серверную версию или создаёт новую mutation поверх свежей версии без silent overwrite.
- School admin получил web-интерфейс occurrence backfill: summary и ambiguity report видны до записи, apply требует явного подтверждения и preview token, а изменившийся план не применяется вслепую.
- Occurrence backfill дополнительно проверяет school scope и metadata conflicts, переносит только однозначные topic/work type, обнаруживает изменение плана между preview/apply и преобразует concurrent slot race в стабильный `BACKFILL_PLAN_CHANGED`.
- Архивные Subject/Topic больше нельзя повторно использовать в новых Homework, ControlWork, Schedule, teacher assignments, LessonTemplate, Grade и occurrence; historical read paths остаются доступными, а массовое включение биржи пропускает архив.
- CI теперь явно блокирует release на web production build, tenant Alembic single-head, SQLite upgrade smoke, focused Homework/backfill/archive suites и проверке синтаксиса workflow YAML.
- Teacher web UI переведён на новую Homework-семантику: выбранный occurrence задаёт целевой урок, deadline включает точное время и timezone, задание можно сохранить черновиком или сразу опубликовать; при отсутствии server occurrence UI не создаёт ложную привязку.
- Student diary показывает опубликованные ДЗ по target occurrence, использует точный deadline и позволяет ученику явно менять version-safe статус «не начато / в процессе / готово»; legacy-задания продолжают группироваться по `due_date`.
- Mobile получил экран Homework и account-scoped SQLite outbox статусов: mutation сохраняет стабильный `client_action_id`, переживает перезапуск и сеть, backend дедуплицирует потерянные ответы durable receipt, а version conflict не перезаписывается молча.
- Добавлен двухфазный occurrence backfill для school admin: preview формирует privacy-safe ambiguity report и SHA-256 plan token, apply связывает только однозначные Grade/LessonTemplate/ControlWork, повтор безопасен, а legacy Homework никогда не угадывается по `due_date`.
- Subject и Topic переведены на soft archive: используемые учебные данные больше не удаляются, рабочие picker-ы скрывают архив, предмет каскадно архивирует темы и отключает биржу, а восстановление выполняется явно без потери исторических названий.
- Закрыт stored XSS-контур школьных новостей: plain-text content больше не проходит через `dangerouslySetInnerHTML`, React экранирует данные, а legacy markup отображается только как очищенный текст.
- Автоматический release теперь запускается через `workflow_run` только после успешного CI для того же commit SHA; checkout, image tags и tenant release используют проверенный immutable SHA, а параллельные релизы одного коммита сериализованы.
- Tenant OpenAPI и generated TypeScript синхронизированы с Homework idempotency/state, maintenance backfill, archive/restore и обновлёнными административными контрактами.
- Push installation защищена proof-of-possession: mobile хранит отдельный 256-битный секрет в SecureStore, tenant хранит только SHA-256 digest и не позволяет пользователю той же школы перехватить endpoint по известному installation UUID; proof отзыва передаётся в заголовке, а не URL.
- Восстановлена privacy boundary эскалации поддержки: raw-ответ platform admin остаётся в Core, org admin готовит отдельный идемпотентный relay для школы, tenant хранит его в admin-only inbox, а requester получает ответ только после явного сообщения school admin/director.
- Homework получил новую семантическую основу: отдельно хранятся урок выдачи, целевой урок, публикация и timezone-aware deadline; deadline больше не создаёт occurrence, legacy `due_date` остаётся совместимым, draft скрыт от ученика, а персональный статус выполнения обновляется через version CAS.
- Добавлен version-safe перенос `LessonOccurrence`: identity и источник расписания сохраняются, связанные даты журнала обновляются атомарно, stale version и занятый слот возвращают различимые `409`, а web передаёт и обновляет актуальную версию урока.
- Закрыты OpSec-дефекты изоляции: org admin видит ноды только своей организации, адресная рассылка не пересекает школы, деактивированная школа не может создавать или продолжать сессии, скрытые moderation-сообщения не попадают в preview и unread count.
- Mobile social, support и realtime приведены к canonical discovery contract: `api_base_url` уже содержит `/api`, поэтому клиент больше не формирует ошибочные URL с повторным `/api`.
- В product master-plan зафиксировано, что legacy-остановка school app за просрочку не развивается; последствия задолженности и staged enforcement будут отдельно спроектированы перед WS5 без автоматической остановки учебного контура.

## [Unreleased] — 2026-07-15

- Удаление оценок защищено optimistic locking: tenant атомарно сверяет версию записи и возвращает `409 Conflict` при конкурентном изменении, а web передаёт актуальную версию из модального окна.
- Добавлен provider-neutral push foundation: tenant шифрует registration tokens через AES-GCM только при настроенном keyring, привязывает installation к refresh session и отзывает её сервером, chat/support создают privacy-safe suppressed outbox events; mobile запрашивает permission только явно, регистрирует Expo token, отслеживает rotation и направляет tap в строгий deep-link resolver.
- Добавлен deep-link foundation: mobile принимает только allowlisted HTTPS/fallback links со stable school UUID, всегда выполняет Core rediscovery, безопасно переключает tenant account или откладывает role-aware target до login; web публикует fallback route и параметризованные AASA/Asset Links без выдуманных store credentials.
- Реализована organization-gated эскалация школьной поддержки: school_admin/director отправляет только явное обезличенное резюме через durable tenant outbox, Core принимает его идемпотентно и скрывает от platform до решения org_admin, а ответы platform дедуплицируются и возвращаются в исходный tenant ticket через pull/ack inbox.
- Завершён metadata workflow школьной поддержки: school_admin/director управляют status/category/priority и назначением через atomic version CAS и exact idempotent replay, видят content-free audit history и расширенные inbox counters; web admin получил conflict-safe controls без optimistic updates.

## [Unreleased] — 2026-07-14

- Реализован end-to-end basic School Support: student/parent/teacher создают несколько text-only обращений и переписываются со shared inbox school_admin/director; tenant обеспечивает idempotency, unread/read, notifications, audit и school isolation, web покрывает обе стороны, а mobile requester использует account-scoped cache и durable SQLite outbox.
- Добавлен защищённый media foundation tenant и shared client: приватное quarantine/clean-хранилище, строгая MIME/extension/magic/size/SHA-256 валидация потоковых загрузок, fail-closed scanner contract, school-scoped авторизация, внутренние bindings, аудит, очистка и единый multipart/binary transport с rotating refresh.
- Реализован end-to-end realtime v1 для social/chat: одноразовые 60-секундные WebSocket tickets хранятся только как SHA-256 digest, tenant доставляет участникам только content-free события после успешных транзакций, а web/mobile выполняют account-scoped REST reconciliation с новым ticket на reconnect и сохраняют polling fallback.

## [Unreleased] — 2026-07-12

- Добавлен tenant moderation/retention-контур личных чатов: жалоба создаёт ограниченный evidence case без свободного доступа к перепискам, просмотры и version-safe действия school_admin/director аудируются, сообщения скрываются tombstone-ом, conversation lock запрещает отправку, а конкурентно безопасный worker удаляет только истёкший контент без active hold и восстанавливает cursors.
- Добавлен web UI модерации личных чатов: ученики видят скрытые сообщения и блокировку диалога, могут идемпотентно пожаловаться только на видимое чужое сообщение; школьные администраторы получили content-free очередь, ограниченные материалы обращения и version-safe действия без optimistic updates.
- Реализован end-to-end MVP личных чатов учеников: tenant хранит единственный диалог пары друзей, cursor-историю, unread/read state и duplicate-safe сообщения с запретом ссылок и динамическими social policy checks; web и native mobile получили списки диалогов, переписку, optimistic send, а mobile также durable offline message outbox.
- Реализован первый end-to-end offline mutation contract для пользовательской настройки push preview: tenant API использует durable idempotency receipts, ETag/If-Match и атомарный version CAS, а mobile SQLite outbox сохраняет мутации между запусками, изолирует аккаунты, повторяет временные ошибки и предоставляет явное разрешение конфликтов двух устройств.
- Подготовлен защищённый manual workflow EAS preview builds для Android/iOS: добавлены стабильные native identifiers, dynamic Expo project linkage через repository variable, preflight секретов, mobile gates, environment protection, concurrency cancellation и асинхронный запуск без хранения Expo credentials в репозитории.
- В CI добавлен отдельный mobile gate на совместимом с Expo SDK 57 Node.js 22.13: TypeScript, unit-тесты persisted cache, валидация Expo config и Metro exports для Android/iOS выполняются без EAS credentials.
- Добавлен account-scoped persisted read cache мобильного клиента: успешные tenant-запросы сохраняются в Expo SQLite по stable `tenant_id:user_id`, безопасно гидратируются при запуске и переключении аккаунта, очищаются адресно при logout и показывают явные offline/stale состояния.
- Создан `perum-mobile` на Expo SDK 57 и Expo Router: tenant discovery, login, cold-start session restore с rotating refresh, безопасное хранение refresh-токенов, role routing, несколько изолированных аккаунтов, account switcher и локально гарантированный logout.
- Curated OpenAPI-контракт дополнен tenant logout и перегенерирован после расширения Core discovery; общий npm workspace выравнивает React typings web/mobile и проверяет оба приложения единым typecheck.
- В общий API client добавлен tenant/account-scoped mobile auth adapter: rotating refresh-токены сохраняются атомарно, параллельные 401 объединяются в один refresh flight с одним retry, а ошибки и logout изолированы namespace с concurrency-тестами.
- Tenant discovery переведён на стабильные public UUID организаций и школ: добавлены индексированные selectors по host, UUID школы и паре домен организации/код школы, primary-domain для canonical URL и миграция существующих доменов без линейного fallback.
- Обновлён product master-plan: зафиксирована безопасная tenant discovery-схема для разных доменов организаций и школ, разделение core/tenant-сессий, stable public IDs, universal links и фактический roadmap оставшихся работ.
- Social API добавлен в curated OpenAPI-контракт для общих web/mobile-клиентов; cursor друзей исправлен на стабильный student-id cursor без пропуска записи между страницами.
- Добавлен web UI social API: админские настройки общения и адаптивная страница друзей ученика с заявками, поиском, блокировками, действиями и clean URL `/friends`.
- Реализован tenant backend vertical slice друзей: школьные social-настройки, поиск учеников по scope и диапазону классов, идемпотентные заявки, дружба и блокировки с изоляцией школ и нормализованными уникальными парами.
- Добавлен совместимый фундамент мобильной аутентификации tenant: хешированные rotating refresh-токены, управление устройствами/сессиями, отзыв при смене пароля и session-backed JWT с сохранением поддержки legacy JWT до истечения.
- Добавлен публичный core discovery для мобильных клиентов: безопасная нормализация tenant-host, поиск по домену школы с fallback на поддомен организации и ограниченный контракт совместимости/capabilities.
- Утверждены продуктовые решения и создан единый `docs/PRODUCT_MASTER_PLAN.md` для social, школьной/платформенной поддержки, биллинга ЮKassa и полного React Native parity. Обновлён `docs/FRIENDS_CHAT_PLAN.md`: настройки школы, модерация, retention, push preview, offline и защищённые вложения.
- Заложен общий web/mobile foundation: корневые npm workspaces, platform-neutral `@perum/api-client`, общие `@perum/domain` и `@perum/design-tokens`, отдельные сгенерированные OpenAPI-контракты core/tenant и drift-check в CI. `perum-web` переведён на общий transport через browser adapter без изменения auth UX.
- Закрыты все high/critical npm audit findings: Next.js и Sentry обновлены, уязвимый `xlsx` заменён на безопасный CSV-export, Quill/DOMPurify удалены в пользу plain-text редактора новостей. В CI добавлен fail gate для high/critical; остаётся временное moderate-исключение встроенного `postcss@8.4.31` в стабильном Next.js 16.2.10 до upstream-релиза.

### Устранение предупреждений инструментов

- Tenant использует совместимый с naive `DateTime` helper UTC; конфигурации Alembic и Next.js приведены к актуальным ключам, middleware переименован в proxy по соглашению Next.js 16, а локальный JWT secret увеличен до рекомендуемой длины.

### Целостность экземпляров уроков

- Шаблоны уроков уникальны по экземпляру, legacy-шаблоны без экземпляра сохраняют частичную уникальность по классу, предмету и дате; журнал и frontend поддерживают несколько слотов одного предмета в день.
- Поиск темы оценки и массовое обновление тем ограничены экземпляром урока, а очистка шаблона атомарно очищает тему и тип работы экземпляра.
- Перенос даты и номера экземпляра временно запрещён до реализации согласованного переноса связанных данных; создание экземпляров и итоговых оценок сериализовано стабильными блокировками.
- Для итоговых оценок без периода добавлена частичная уникальность.

### Остаточные исправления ролей, баланса и аналитики

- Frontend использует только каноническую роль `teacher`: удалены предположения о backend-ролях `class_teacher` и `homeroom_teacher` из типов, навигации, middleware и админских форм.
- Массовое начисление классного руководителя ограничено диапазоном 1–10000, блокирует активных учеников своей школы и класса, нормализует отрицательный исходный баланс к нулю и создаёт отдельную транзакцию с причиной для каждого изменения.
- Учительская аналитика получает реальные периоды через `/periods?class_id`, выбирает текущий период и очищает устаревший дашборд с явным сообщением при ошибке.
- Передача `lesson_number` из модала расписания в формы оценок/ДЗ/шаблона не добавлена: текущий schedule-модал запрещает оценки, не открывает шаблон, а расширение остальных независимых flows требует отдельного согласования UX; backend optional-поля сохраняют совместимость.

### Экземпляры уроков (P3)

- Добавлен совместимый слой `LessonOccurrence` с отдельными слотами по номеру урока, статусами, темой и типом работы без обязательного backfill legacy-данных.
- Оценки, шаблоны уроков, домашние и контрольные работы получили nullable-связь с экземпляром урока; неоднозначные повторные уроки требуют optional `lesson_number`.
- Дневники ученика, родителя и учителя возвращают `occurrence_id` и статус с fallback `scheduled`; добавлен teacher/admin override статуса, даты, номера и темы.

### Родительский учебный кабинет (P4)

- Родитель получил child-scoped дневник с расписанием, ДЗ и контрольными, список и сводку оценок, итоговые оценки и аналитику по периодам; все методы требуют активную связь с учеником той же школы.
- Учебные представления безопасно переиспользуют student service, а даты оценок передаются по `lesson_date`, а не по времени создания записи.
- `/parent` получил адаптивные вкладки «Расписание и ДЗ», «Оценки», «Итоговые», «Аналитика и баланс» с отменой устаревших запросов при смене ребёнка, вкладки или недели.
- Добавлены unit-тесты делегирования и запрета доступа к неактивному или чужому школьному профилю без `pytest-asyncio`.

### Безопасность академических данных (P2)

- Добавлены school/role/activity-проверки состава классов, назначений учителей, расписания и подгрупп; school-scoped роли без школы теперь получают отказ.
- Учебные годы и периоды проверяются по датам и принадлежности школе; удаление используемых предметов, тем, расписаний звонков, периодов и учебных годов возвращает 409.
- Миграция `tenant_0016_academic_hardening` безопасно дедуплицирует членства, назначения, слоты и подгруппы до локальных unique/CHECK-ограничений.

### Корректность учебных периодов и прав (P1)

- Итоговые оценки журнала ограничены выбранным периодом; добавлены school-scoped upsert/delete с проверкой назначения, состава класса и уникальностью.
- Неизвестный период возвращает 404, граница окончания периода включительна, а автоматический выбор предпочитает активный или последний завершённый период.
- Аналитика использует дату урока с fallback на дату создания и единый взвешенный средний для учителя и администратора.
- Дневник учителя показывает ДЗ выбранной недели только у совпадающих класса, предмета и даты; изменения тем ограничены назначенными учителями и администраторами, шаблон разрешён только на дату занятия.

### Объектная авторизация tenant API (P0)

- **Roster класса.** Учитель получает состав только назначенного или своего классного класса; администраторы видят классы своей школы, а ученики в выдаче дополнительно ограничены активной ролью и школой.
- **ДЗ, контрольные и вложения.** Доступные классы вычисляются по роли: собственный класс ученика, классы активных связанных детей родителя, назначения и классное руководство учителя либо все классы администратора. Параметр `class_id` только сужает этот набор, неподдерживаемые роли получают отказ.
- **Кабинет родителя.** Связь родитель-ученик требует активных пользователей соответствующих ролей в одной школе; дети, оценки, транзакции, типы работ, предметы и классы фильтруются по школе.
- **Регрессионные тесты.** Добавлены focused async-тесты объектной авторизации, запускаемые через `asyncio.run` без `pytest-asyncio`.

## 2026-07-10

### Целостность оценок и баланса (P0)

- **Валидация получателя оценки.** Создание оценки разрешено только активному ученику той же школы, состоящему в выбранном классе; update повторно проверяет актуальность получателя.
- **Тип работы из текущей школы.** Create и update отклоняют отсутствующий, неактивный или принадлежащий другой школе тип работы.
- **Единые правила create/update.** Изменение оценки проверяет диапазон оценки и допустимость отметки посещаемости так же, как создание; некорректная `lesson_date` возвращает ошибку вместо подмены текущей датой.
- **Точный ledger.** Транзакции создания, изменения и удаления оценки записывают фактически применённую к балансу сумму с учётом нижней границы `0`.

### Тема урока для всего класса

- **Серверный шаблон урока.** Тема и тип работы для сочетания класс/предмет/дата теперь сохраняются в tenant-БД, а не только в `localStorage` браузера учителя.
- **Массовое применение темы.** Сохранение шаблона одним действием обновляет тему у всех уже выставленных оценок класса за выбранную дату; новые оценки за эту дату автоматически получают ту же тему.
- **Журнал учителя синхронизирован между устройствами.** Шаблоны приходят в ответе журнала и используются как значения по умолчанию при выставлении оценок.
- **Проверки доступа и целостности.** API отклоняет темы другого предмета/школы; просмотр оценки теперь также проверяет доступ учителя к журналу.
- **Миграция `tenant_0014_lesson_templates`.** Добавлена таблица `lesson_templates` с уникальностью по классу, предмету и дате.
- **Версия tenant `1.1.2`.** Версия повышена для корректной регистрации OTA-релиза после изменения tenant-кода.
- **ДЗ ученика привязаны к дате.** Дневник загружает задания только за выбранную неделю и показывает их только у урока того же предмета с совпадающим `due_date`; задания больше не дублируются на все уроки предмета.
- **Даты журнала строятся по расписанию.** Учитель может задать тему заранее на любую дату занятия в выбранном учебном периоде, даже если оценок за этот день ещё нет.
- **Безопасный сброс шаблона.** Отключение автоподстановки не стирает темы уже выставленных оценок; шаблон без темы не перебивает тему, выбранную вручную.
- **План друзей и чатов.** Добавлен `docs/FRIENDS_CHAT_PLAN.md` с моделью данных, API, UI, безопасностью, этапами и критериями готовности.

## 2026-07-08

### ДЗ и оценки с темой урока (P1 #5, #6)

- **Учитель видит существующие ДЗ в модале урока.** `TeacherLessonModal` вызывал stub `/api/teacher/homework` (возвращал пусто) → учитель никогда не видел заданные ДЗ. Переключён на реальный `GET /api/homework` (coursework-роутер) с `due_date`+`attachments`.
- **Вкладка «Работы» у учителя работает.** Реализован `GET /api/teacher/works` — объединённый список ДЗ + контрольных работ с пагинацией (раньше stub `{"works": []}`).
- **Лента активности учителя работает.** Реализован `GET /api/teacher/homework` — последние 50 ДЗ учителя (раньше stub `{"homework": []}`).
- **`GET /api/teacher/control-works` подключён** к реальному coursework-сервису (раньше stub).
- **Teacher diary: ДЗ с due_date и вложениями.** `teacher_diary` возвращал homework без `due_date` и `attachments` → фронт-фильтр по дате всегда давал пусто. Теперь возвращает полные данные.
- **Убрана проверка `hw.completed`.** Frontend `useSchedule` проверял несуществующее поле → статус работы никогда не был `completed`. Убран.
- **Оценки с темой урока — последняя миля.**
  - `GET /api/journal/grades/{id}` теперь возвращает `topic_id` + `topic_name`.
  - `UpdateGradeRequest` + `update_grade` — тема редактируется.
  - Сетка журнала `get_journal` возвращает `topic_id` + `topic_name` в `grade_dicts`.
  - Ученик: `student/diary` и `student/grades` возвращают `topic` для каждой оценки.
  - `ViewGradeModal` — тема в просмотре + select темы в редактировании.
  - `TeacherGradesTab` — тема в тултипе ячейки оценки.
  - `LessonModal` (ученик) — тема под оценкой.
  - `AnalyticsDashboard` (ученик) — тема в тултипе.
  - TS-типы `Grade`, `DiaryGrade`, `GradesResponse.grades`, `GradeRow` расширены полем `topic`.
- **Удалён мёртвый `TopicsTable.tsx`** (не импортировался нигде).

### Исправления админки школы (P0 #2)

- **Убран SupportInbox.** Мёртвая заглушка «почта поддержки» (фейковые ответы, пустой инбокс). Убран из сайдбара, типа секций и рендера. Заменён будет школьным чатом поддержки (Блок 3).
- **Убрана кнопка «Сбросить кэш».** Эндпоинт `/api/admin/system/clear-cache` не существует с момента порта легаси. Кнопка всегда показывала ошибку.
- **Починен ControlWorksSection.** URL исправлен с `/admin/control-works` на `/control-works` (реальный путь в tenant). `require_teacher` уже включает `SCHOOL_ADMIN` — админы школ имели доступ, но били не туда.
- **Починен ExchangeManagement.** Добавлен отсутствующий эндпоинт `POST /api/admin/subjects/enable-all-exchange` в `perum-tenant`. Кнопка «Включить все предметы для торгов» и авто-включение при открытии окна торгов теперь работают.

### DNS-фиксы (задача P0 #1)

- **DNS при архивации школы.** `_delete_school_dns` теперь вызывается не только при `purge=True`, но и при обычной архивации (`purge=False`). Раньше архивная школа оставляла A-запись в Cloudflare. Исправлено в `perum-core/app/routers/schools.py`.
- **`_sync_school_dns` корректно обновляет запись.** При смене IP ноды старая A-запись удаляется перед созданием новой (раньше создавался дубликат). Исправлено в `perum-core/app/services/school_provisioner.py`.
- **Авто-синхронизация DNS.** Фоновая петля `_dns_sweep_loop` раз в `DNS_SWEEP_INTERVAL_S` (20 мин) сверяет A-записи всех активных организаций с Cloudflare через `sync_org_dns`. Создаёт недостающие, удаляет осиротевшие. Новый конфиг `DNS_SWEEP_INTERVAL_S`.
- **DNS в консоли org_admin.** Новые эндпоинты `GET /api/org/dns` (статус CF + записи школ) и `POST /api/org/dns/sync` (принудительная синхронизация). В таблице школ — колонка DNS (✓ OK / ✗ Ошибка / manual). Кнопка «Синхр. DNS» при включённом CF. Раньше DNS был виден только platform_admin.

### Документация

- **PLAN_JULY.md:** исправлен раздел «Вырезать лишний функционал» — убрана неверная информация о нереализованных бирже/маркете/квестах (все полностью реализованы: 16+8+7 эндпоинтов в `perum-tenant`). Скорректирован фокус на коммерческий запуск вместо MVP.

## 2026-07-06

### Security: изоляция школьных стеков на уровне Docker network

- **Каждая школа получила собственную Docker network** (`school_schN_net`). Контейнеры (app, db, redis) изолированы от других школ, docker_proxy и shared Redis.
- **Per-school Redis**. Вместо общей ноды Redis с 16 DB-индексами — отдельный контейнер Redis на школу. Устраняет риск переполнения DB-индексов и cross-school interference.
- **Caddy подключён к каждой школьной сети**. Школьные маршруты используют `add_route` (split `/api/*` → tenant app, остальное → perum_web) вместо `add_proxy_route`.
- **Предзагрузка образов** postgres:15-alpine, redis:7-alpine, caddy:2-alpine в deploy-node.sh.

### Production deployment — 3 servers, 2 orgs, HTTPS

- **Развёртывание на 3 сервера.** Core (`171.22.73.2`, `пэрум.рф`) + 2 ноды: `grsn-panel.ru` (2.59.80.220), `avari-land.ru` (62.113.75.30). Cloudflare DNS-only, TLS через Caddy с Let's Encrypt на нодах.
- **HTTPS на нодах.** Caddy на выделенных нодах получает сертификаты через on_demand TLS (Let's Encrypt). Добавлен порт 443 + env `CORE_URL`/`ACME_EMAIL` в compose ноды. `Caddyfile.prod` открывает `/internal/validate-domain` для проверки доменов.
- **Лендинги организаций.** Обе организации отдают лендинг по HTTPS с перечнем школ.

### Исправления

- **Школа без метрик не считается офлайн.** Активная школа, у которой нет метрик (только что создана или метрики ещё не собраны), теперь `online`, а не `offline`. Исправлено в `perum-core/app/services/school_metrics.py`.
- **Текст в админке копируется.** `.contentSection` в админ-панели (`perum-web/src/app/admin/page.module.css`) теперь `user-select: text` — токены, домены, IP можно выделить мышью.
- **Санитизация названий.** Пробелы в именах нод (`NodeCreate`/`NodeUpdate`) и названиях организаций (`OrganizationCreate`) заменяются на дефисы — имена используются в именах файлов/директорий и не должны содержать пробелов.
- **Безопасность production.** Защищены эндпоинты агента (`/restart`, `/schools`, `/heartbeat`) — требуют `AGENT_TOKEN`. Включены прод-валидаторы на `SECRET_KEY`, `AGENT_TOKEN`, `SECRETS_ENCRYPTION_KEY`. CORS ограничен HTTPS-доменами. `/docs`, `/redoc`, `/openapi.json` отключены в проде.
- **Индексы производительности.** Миграция `0027`: добавлены индексы на `School.status` и `Node.status`, уникальное ограничение `(org_id, subdomain)` для школ.
- **Некритичный landing refresh + DNS sync.** Ошибка при `_refresh_org_landing` или `_sync_school_dns` больше не блокирует провижининг — школа создаётся активной, ошибки логируются.
- **Ошибка провижининга в UI.** Сохраняется в `School.status_message` (миграция `0026`) и отображается в консоли org_admin.
- **`perum_web` на нодах.** Добавлен в compose ноды; Caddy-маршруты школ используют `add_route` (split `/api/*` → tenant app, остальное → frontend).
- **Документация плана тарификации.** В `docs/PLAN.md` добавлен раздел с 3 вариантами тарификации: базовая, таргетированная, корпоративная.

### DNS-архитектура

- **Wildcard-записи удалены** из всех зон. Каждая школа получает индивидуальную A-запись `school.domain → node_ip`.
- **Синхронизация защищает** apex и www от удаления. Wildcard больше не защищён — удаляется при sync.

## 2026-07-04

### Подготовка к переразвёртыванию на 3 сервера

- **Скрипт `deploy-node.sh`** перенесён из `feat/deploy-node-and-core-routing` в `main`. Авто-развёртывание полного стека ноды: Docker, perum_agent (воркер), Postgres, Redis, Caddy, docker-socket-proxy, Watchtower. Healthcheck на `/api/agent/health`.
- **Обновление лендинга при изменении школ.** Добавлена `_refresh_org_landing()` — пересоздаёт лендинг организации на ноде при создании, заморозке, разморозке и удалении школы.

### Cloudflare DNS — авто-управление A-записями школ (задача 5)

- **`dns_manager.py`** — новый сервис-абстракция над Cloudflare API (`Zone:DNS:Edit`). Методы: `create_record` (A-запись поддомена → IP ноды), `delete_record`, `list_records`, `sync_org_dns` (массовая синхронизация), `find_zone` (поиск zone_id по домену). DNS-only режим (серые облака, без проксирования).
- **Настройки:** `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_DNS_ENABLED` в конфиге ядра. Пусто → ручной режим (подсказки в UI).
- **Авто-зонирование.** При создании орг ядро авто-находит CF-зону (`_auto_detect_cf_zone`), заполняет `Organization.cf_zone_id` + `dns_provider = "cloudflare"`. При создании школы — авто-создаёт A-запись (`_sync_school_dns`). При purge школы — удаляет запись (`_delete_school_dns`).
- **Миграция `0025_dns_provider`:** новые поля `organizations.dns_provider` / `cf_zone_id` и `schools.cf_record_id`.
- **API:** расширен `GET /organizations/{id}/dns` — CF-статус + таблица записей школ. Новый `POST /organizations/{id}/dns/sync` — принудительная синхронизация.
- **UI:** модалка DNS в консоли платформы: индикатор CF (активно/ручной), кнопка «Синхронизировать», таблица A-записей поддоменов школ (поддомен → FQDN → IP ноды → статус).

## 2026-06-22

### Нода: агент-порт опубликован + тест конфигурации deploy

- **`org_agent` публикует AGENT_PORT 3001 на хосте.** `deploy/org-node/docker-compose.yml` — добавлен `ports: ["3001:3000"]` для сервиса `org_agent`. Без этого ядро не могло достучаться до `http://{hostname}:3001/api/agent/whoami` → `node.status = "offline"`. Uvicorn внутри контейнера слушает `:3000`, порт 3001 на хосте — это то, что использует `RemoteNodeClient` (config `AGENT_PORT`).
- **`test_deploy_config.py`** — новый тест: проверяет, что `org_agent` публикует порт 3001 и `caddy` публикует 80/443. Регрессия в compose-файле теперь ломает `pytest`.

### Изоляция тенантов: правки по итогам аудита

- **Node Caddy re-sync при рестарте воркора.** `_resync_node_caddy_routes()` — при старте `org_agent` восстанавливает лендинг-маршрут, маршруты активных и maintenance-маршруты замороженных школ из локальной БД. Домен орг сохраняется в локальный shadow-record при первом `provision_landing`.
- **Redis DB index: min-unused вместо modulo.** `_next_redis_db_index()` выбирает наименьший свободный индекс из уже занятых `SchoolSecret.redis_db_index`; устраняет коллизию при id кратных 16 на одной ноде.
- **`suspend/unsuspend_school` — реальный хост из `SchoolDomain`.** Maintenance- и proxy-маршруты теперь ставятся на фактический хост (`gym5.acme.ru`) из таблицы `school_domains`, а не на `slug.PUBLIC_BASE_DOMAIN`.
- **`add_proxy_route` везде для tenant-образов.** `unsuspend_school`, `tenant_provisioner`, platform Caddy sync и кастомные домены переключены на `add_proxy_route`; tenant-образ обслуживает фронтенд и API из одного порта `:3000`, split-маршрут `WEB_UPSTREAM` был неприменим.
- **Platform Caddy sync пропускает нод-орги.** `_sync_caddy_routes` при старте ядра фильтрует орги с `node_id IS NOT NULL` — у них нет локальных контейнеров.
- **`Organization.nodes` — явный `foreign_keys`.** Два FK-пути между `organizations` и `nodes` требовали `foreign_keys="[Node.org_id]"` на обоих концах relationship; SQLAlchemy поднимал `AmbiguousForeignKeysError`.
- **Тесты обновлены под новую схему.** `OrganizationCreate(domain=…, node_id=…)` вместо `slug`; пути `/{org_id}` вместо `/{slug}` в `test_billing`, `test_r1_r5_endpoints`, `test_telemetry_stats`; `SchoolCreate(subdomain=…)` в `test_school_slug_and_security`; `test_slug_validation` переписан под domain-валидацию.

### Доменная идентичность организаций и школ (ломающий рефактор)

Организация теперь идентифицируется **доменом** (он же её лендинг), школа — **поддоменом** этого домена. Ядро — тонкий реестр (авторизация + биллинг), все стеки живут на нодах.

- **Миграция `0024_domain_identity`.** Добавлены поля `domain` (unique), `node_id` (FK nodes, SET NULL) и `landing_status` (`pending|active|failed`) в таблицу `organizations`; `subdomain` (String 63) в таблицу `schools`. Бэкфилл: `domain = slug + "." + base` для существующих орг; `subdomain = slug` для существующих школ.
- **Slug → внутренний инфра-токен.** `slug` организации выводится из домена (`slug_from_domain(domain)`) и остаётся как имя контейнеров/томов; наружу не выставляется — идентичность орг это домен. У школ `slug = f"sch{school.id}"` — глобально уникален по нодам.
- **API организаций переключён на числовой `/{org_id}`.** Все эндпоинты `/api/organizations/{slug}/...` → `/api/organizations/{id}/...`. Новый `GET /api/organizations/{id}/dns` — инструкция A/CNAME (корень `@` и wildcard `*` → IP ноды).
- **Лендинг организации на ноде.** При создании орг (`domain`, `node_id`, `name`) воркор ноды поднимает контейнер `landing_{slug}` (nginx:alpine + сгенерированный `index.html`) и добавляет маршрут в Caddy ноды на корневой домен. `landing_status` возвращается в ответе. Снос орг — сносит лендинг и все школы через воркор.
- **Школы по поддомену.** `SchoolCreate.subdomain` вместо `slug`; уникальность — в рамках орг; полный хост `<subdomain>.<org.domain>` передаётся воркеру для Caddy-маршрута на ноде. `GET /api/schools/info` — базовая информация орг (включая домен) для org_admin.
- **Воркор (agent): новые эндпоинты.** `POST /landing/provision` — поднять landing-контейнер (nginx:alpine, index.html через base64 echo | base64 -d) + Caddy proxy-route на домен; `POST /landing/{org_slug}/deprovision` — снести; схемы `AgentLandingRequest/AgentLandingResponse`.
- **`caddy_admin.add_proxy_route`** — маршрут для лендинга (всё → upstream:80), дополняет существующий `add_route` (split /api + /).
- **Фронтенд — платформа-админ.** Форма «Создать орг»: поле `домен` + выбор ноды; список орг показывает `domain`, `landing_status`, кнопку **DNS** (модалка с точными записями для регистратора). Все API-вызовы переключены на `org.id`.
- **Фронтенд — кабинет орг.** Форма «Создать школу»: поле `поддомен` с живым предпросмотром адреса `<поддомен>.<домен-орг>`; таблица школ показывает `full_host`; подтверждение удаления — по поддомену.
- **DNS-модель.** DNS настраивает оператор вручную по гайду в UI: `@` и `*` → IP ноды; TLS выпускает node Caddy (on-demand). Ядро больше не роутит школьный трафик через себя.

### Обновление 2026-06-20

### Мониторинг нод 24/7, авто-обновление воркора, реал-тайм UI
- **Реальные метрики ноды (CPU/ОЗУ/ПЗУ + латентность).** Монитор-петля ядра тянет `/health` воркора (psutil) и пишет снимок в `nodes.last_*` + `last_ping_ms`; параллельный опрос всех нод. Поля в `NodeResponse`, миграция `0023_node_metrics`. UI рисует живые бары.
- **Реал-тайм каждые 2 секунды.** Раздел «Инфраструктура» (платформа и орг) поллит каждые 2с; эндпоинт `/utilization` делает ЖИВОЕ обновление (ping+health) на каждый вызов — данные реально свежие, а не раз в минуту (`refresh_node_metrics`, общий код для петли и on-demand).
- **Фикс ложного «оффлайн».** Иконка/статус ноды берутся из `node.status` (его ставит монитор ядра), фронт больше не пересчитывает по heartbeat (naive-UTC парсился как локальное время → красная иконка + пилюля «Онлайн» + подпись «оффлайн» одновременно). Таймстемпы парсятся как UTC.
- **Ёмкость по лимиту оператора.** Шкала «школы X/Y» = `node.max_schools` (что задал оператор), а не ресурсная оценка; `recommended_max` показывается подсказкой «(рек. N)». Раньше было `0/2` при выставленном максимуме `4`.
- **Авто-обновление воркора (Watchtower).** В стек ноды добавлен Watchtower: при выходе нового образа ядра (CI пушит `perum-core:latest`) он сам пуллит и пересоздаёт воркор (только по label — школы не трогает). Ноды обновляются без SSH. `DOCKER_API_VERSION` задан под свежий демон.
- **Перезагрузка = полный рестарт стека ноды ВКЛЮЧАЯ воркор.** Воркор рестартует все контейнеры стека и себя (в фоне, после ответа); ядро сразу метит ноду offline, монитор возвращает active — связь пропадает и появляется.
- **Фикс `DockerClient.list_containers`** (его не было → `/health` и `/schools` воркора падали 500) и **бэкап вложений школы на ноде** (`demux=True` — через docker-proxy ноды tar шёл с фрейм-заголовком → не-gzip).
- **Документация:** новый `docs/WORKER.md` — воркор как прослойка ядро↔школы↔ноды (API, enroll, жизненный цикл, мониторинг, авто-обновление, безопасность); раздел в README про авто-обновление воркора.

### Школы на удалённых нодах — провижининг и обновление (мульти-сервер) ✅ проверено вживую
- **Достроена связка ядро→воркер ноды.** Раньше это были «леса» (модель `NodeAssignment`, эндпоинты воркера `/api/agent/*`, `RemoteNodeClient` — но ничего не вызывалось; провижининг всегда шёл на хосте платформы). Теперь `schools.py` `_run_lifecycle` ветвится: если у школы есть нода (назначение или `find_best_node` по орг) — провижининг/апдейт идёт **на ноду** через воркер; иначе локально. Оркестраторы `provision_school_orchestrated` / `update_school_orchestrated` создают `NodeAssignment`, шлют секреты+образ воркеру (`RemoteNodeClient`), а на платформе добавляют Caddy-маршрут `<slug>.<base>` → `нода:80`.
- **Маршрутизация без смены DNS.** Wildcard `*.<base>` уже указывает на платформу; платформа терминирует TLS и проксирует `/api` школы на ноду (`нода:80`), остальное — на общий фронтенд. На ноде свой Caddy раздаёт по Host на контейнер школы. То есть школа на ноде сразу публично доступна по `https://<slug>.<base>`.
- **Исправлены не тестированные баги воркера/транспорта:** `RemoteNodeClient` бил в `/agent/` на порт 3000, а роуты под `/api/agent` на 3001 → выровнено (порт `AGENT_PORT`, путь `/api/agent`, auth `AGENT_TOKEN`); `provision_school_on_node` падал на `org_id` и игнорировал переданные секреты → чинено (локальная орг + секреты из запроса); образ тенанта ядро передаёт явно (на ноде нет таблицы релизов).
- **Bootstrap-скрипт ноды переписан под рабочий стек.** Прежний генерировал битый compose (образ `ghcr.io/perum/...`, без redis/caddy/docker_proxy/миграций, пустой Caddyfile → 500 при добавлении маршрута). Теперь «Создать ноду» → скрипт ставит Docker и поднимает: воркер (`ROLE=org_agent`, миграции, порт `AGENT_PORT`, `AGENT_TOKEN`) + локальная БД + redis + docker_proxy + Caddy (admin + `:80` с catch-all). Новые настройки ядра: `AGENT_TOKEN`, `AGENT_PORT`, `AGENT_IMAGE`, `PUBLIC_CORE_URL`.
- **Полный жизненный цикл школы на ноде.** Заморозка/разморозка, архивация/удаление и управление администраторами школы теперь тоже работают для школ на нодах: ядро ветвит операции на `RemoteNodeClient`. Управление админами проксируется новым воркер-эндпоинтом `/api/agent/schools/{slug}/internal-rpc` (контейнер школы в сети ноды недоступен ядру напрямую). При удалении снимается и маршрут на платформе.
- **Маршрут школы на ноде переживает рестарт ядра.** `_sync_caddy_routes` восстанавливает маршрут школы с `NodeAssignment` на `нода:80` (раньше перетирал на локальный контейнер → 502 после рестарта).
- **Проверено на реальной второй ноде** вживую: создание, обновление (`git-6817 → :latest`, история `success`), заморозка/разморозка, добавление/сброс пароля админа школы, выживание маршрута после форс-рестарта ядра, и **полностью автоматическое** создание новой школы (без ручных шагов: org_admin жмёт «Создать школу» → авто-выбор ноды → провижининг → публичный доступ) — HTTP 200.
- **Известная проблема (follow-up): purge школы НА НОДЕ.** При безвозвратном удалении бэкап БД (pg_dump) снимается успешно, но бэкап тома вложений на ноде возвращает не-gzip (через docker-socket-proxy ноды tar-вывод не начинается с gzip-magic, в отличие от хоста платформы) → ядро деградирует до архивации (тома сохраняются) и просит повторить. Запись школы в ядре при этом удаляется — нужно либо чинить `backup_volume_tar` под окружение ноды, либо для нод бэкапить вложения через воркер. Архивация (purge=false), создание, апдейт, заморозка, управление админами — работают штатно.

### Актуализирован FAQ управления нодами + диагностика OTA на проде
- **FAQ «управление серверами (нодами)» приведён к текущему поведению.** Убраны устаревшие шаги (копирование `docker-compose.yml` + `docker compose up -d`). Теперь описаны: скачивание `.sh`-скрипта установки (Docker + воркер `ROLE=org_agent` + enroll, токен вшит), авто-определение железа воркером, авто-выставление статусов ядром (`не установлена`/`active`/`вывод`/`offline`), питание (вкл/выкл), перезагрузка стека только online-нод, редактирование, «Школы на ноде», массовые действия и подбор сервера. Только текст модалки в `platform/page.tsx`.
- **`perum-tenant/VERSION` = 1.1.0** — выровнено с реальной линией релизов прода (там уже были релизы 1.0.0/1.1.0); прежнее `0.1.0` было «позади» и сделало бы текущим релизом версию ниже работающей.
- **Предупреждение об откате апдейта больше не залипает.** В таблице школ значок «прошлое обновление откатилось» показывается только когда обновление реально доступно (есть на что обновляться), а не как вечный нашлёп после давнего сбоя.
- **Авто-публикация релизов тенанта из CI включена.** В ядро проброшен `RELEASE_PUBLISH_TOKEN` (`deploy/docker-compose.core.yml` + `.env.prod`), в GitHub заданы `vars.CORE_URL` и секрет `RELEASE_PUBLISH_TOKEN`. Теперь пуш с изменением кода тенанта и бампнутым `perum-tenant/VERSION` → CI сам собирает образ И регистрирует релиз текущим (`POST /api/ci/release`). Проверено: верный токен принимается, неверный — 401.
- **Известное ограничение (ноды).** Создание и OTA-обновление школ сейчас выполняются ТОЛЬКО на хосте платформы (локальный docker через `docker_proxy`). Привязка школа→нода (`NodeAssignment`) и вызовы `RemoteNodeClient.provision_school/update_school` в коде НЕ задействованы — школы на удалённые ноды пока не разворачиваются. Ноды сегодня: регистрация, мониторинг статуса, перезагрузка стека. Полный мульти-сервер (провижининг/апдейт через воркер ноды) — отдельная задача.
- **Релиз тенанта 1.1.1 на GHCR (текущий).** `perum-tenant/VERSION` → `1.1.1`; CI собирает и пушит `ghcr.io/syb1v/perum-tenant:git-<sha>`, релиз публикуется текущим. Теперь текущий релиз указывает на **пуллящийся из реестра** образ (а не локально собранный), поэтому новые школы и обновления работают и на хосте платформы, и на любых будущих нодах.
- **Разбор на проде (демо-школа «опять пишет, что обновление откатилось»).** Первопричина — НЕ код: в настройках источника OTA `image_repository` был `syb1v/perum` вместо `syb1v/perum-tenant`, поэтому каждый опубликованный образ получал несуществующий путь `ghcr.io/syb1v/perum:git-…` → `denied` при pull → корректный откат. Плюс «текущим» был ошибочно опубликован релиз `0.1.0` (ниже работающего `1.1.0`). Исправлено на проде: `image_repository`→`syb1v/perum-tenant`, текущим релизом снова `1.1.0` (совпадает с образом школы), удалены битые релизы с путём `…/perum:git-*` и зачищены откатные записи истории. Образ `ghcr.io/syb1v/perum-tenant:*` публичный и тянется — путь форварда исправен.

### Версии релизов в формате x.y.z + чинён OTA-апдейт школ
- **Семвер тенанта в файле `perum-tenant/VERSION`.** Единый источник версии (x.y.z). Образ по-прежнему собирается на `git-<sha>` (immutable, реально пушится CI), а `version_tag` релиза теперь — человеческая версия из `VERSION`. То есть git-sha — «код версии», x.y.z — версия. Тенант читает `VERSION` в `FastAPI(version=…)`; Dockerfile копирует файл в образ.
- **«Подтянуть последнюю версию» читает VERSION и не дублирует.** `POST /api/platform/ota-config/fetch-latest` берёт семвер из `perum-tenant/VERSION` на последнем коммите тенанта (GitHub contents API), образ оставляет на `git-<sha>`. Если версия уже актуальна (совпадает с текущим релизом или уже опубликована) — возвращает `up_to_date`, и UI пишет «уже актуальная версия» вместо предложения опубликовать дубликат. Чтобы выкатить релиз — бампнуть `VERSION`.
- **CI публикует релиз с семвер-версией.** `release.yml`: tenant-release читает `perum-tenant/VERSION` → `version_tag` (семвер), `image` = `…:git-<sha>`. Без бампа VERSION ядро отклонит дубликат `version_tag`.
- **Настройки источника обновлений скрыты.** Карточка «Источник обновлений (OTA)» в разделе «Релизы» спрятана по умолчанию — открывается кнопкой «⚙ Настройки источника обновлений».
- **Фикс: обновление школы «по кнопке» теперь наблюдаемо.** Эндпоинт `/api/schools/{id}/update` помечает статус `updating` **синхронно** (коммит до фоновой задачи) — раньше фронт не видел переходного статуса и казалось, что «ничего не произошло, вернулось в исходное». На no-op (уже на текущем релизе) статус корректно возвращается в `active` с логом. `/update-status` теперь отдаёт `current_version` (семвер школы) и `last_update` (итог последней попытки: `success`/`rolled_back`/`failed` + текст ошибки) — организатор видит, **почему** не обновилось; в таблице школ показывается семвер и значок отката/ошибки.

### Новости, уведомления и поддержка (тикеты) для организаций
- **Новости из ядра.** Раздел «Новости» в консоли платформы (`platform_admin`): написать новость и адресовать её **всем** организациям или **выбранным** (мультиселект). При публикации каждому активному организатору приходит уведомление. Бэкенд: модели `news_posts` + `news_targets`, роутер `/api/news` (CRUD для платформы, `GET /feed` для организатора), миграция `0022_news_support`. У организатора — раздел «Новости» с лентой (закреплённые сверху).
- **Колокол уведомлений у организатора.** В шапке консоли организатора (`ConsoleShell`) — колокол с бейджем непрочитанных и выпадающим списком; новые непрочитанные показываются всплывающими тостами (поллинг). Источники: новости и ответы поддержки. Модель `notifications` (per `org_admin`), роутер `/api/notifications` (список, счётчик непрочитанных, отметка прочитанным). Компонент `NotificationBell`.
- **Плавающий чат поддержки + тикеты.** У организатора — плавающая кнопка чата (снизу-справа): список своих обращений и переписка по каждому, создание нового тикета. В ядре — раздел «Поддержка»: инбокс всех тикетов (фильтр по статусу), переписка, ответ, смена статуса; на пункте меню — **бейдж** числа тикетов с непрочитанными сообщениями от организаций. Модели `support_tickets` + `support_messages`, роутер `/api/support` (org-эндпоинты `/tickets*` + платформенные `/admin/*`). Компоненты `SupportChatWidget`, `SupportInbox`. Сервис `services/notifications.py` (фан-аут новостей, уведомление об ответе поддержки). Всё на REST-поллинге (websocket в кодовой базе нет).

### Инфраструктура нод — UI в стиле Remnawave + мастер создания
- **Тёмный список нод (Remnawave-style).** Полная переделка секции «Инфраструктура» в консоли платформы: строки нод с бирюзово-зелёной свечой-индикатором по статусу, sparkline-иконкой, **флагом страны**, моноширинными метриками, статус-пилюлями, баром ёмкости (школы/диск) и чипами аптайма/версии. Переделана именно инлайн-секция `platform/page.tsx` (раньше правки уходили в неслинкованную страницу `/platform/infrastructure`, которую пользователь не видел).
- **Мастер «Создать ноду» (2 шага).** Прогресс-бар, поле `Secret Key (SECRET_KEY)` с копированием, внутреннее имя, выбор страны (с флагами), **привязка ноды к организации**, домен/IP + Node Port, кнопка «Копировать docker-compose.yml». Шаг 2 — превью `docker-compose.yml` + enrollment-токен + инструкция `docker compose up -d`. Новые `src/lib/countries.ts`, `src/components/platform/InfraNodes.tsx`, `src/app/platform/infra.module.css`.
- **Поле страны у ноды.** Модель `Node` дополнена `country_code` (ISO 3166-1 alpha-2) — миграция `0019_add_node_country`; флаг рендерится в UI из кода.
- **Скачивание скрипта вместо docker-compose + авто-определение железа.** В мастере «Создать ноду» кнопка «Копировать docker-compose.yml» заменена на «Скачать скрипт установки» (bootstrap `.sh`, который ставит Docker, поднимает воркера `ROLE=org_agent` и выполняет enroll-handshake). Ручные поля CPU/RAM/диск убраны — воркер снимает их сам (`psutil`) и присылает ядру при подключении. `enroll` теперь привязывает токен к ноде: ставит `status=active`, `last_heartbeat`, `agent_version` и реальные `cpu_cores/ram_gb/disk_gb`. Pool-ноды (без организации) больше не получают 404 при enroll.
- **Bootstrap-эндпоинт принимает GET и POST** + отдаёт `docker_compose` и `enrollment_token` (генерация `docker-compose.yml` с вшитыми ENROLLMENT_TOKEN/SECRET_KEY/DB_PASSWORD).

### Статус ноды — автоматический (мониторинг ядро↔воркер) + динамичная иконка
- **Авто-мониторинг статуса.** Фоновая петля ядра (`_node_monitor_loop`, `NODE_MONITOR_INTERVAL_S=60с`) пингует воркер каждой ноды и сама ставит `active`/`offline` + свежий `last_heartbeat`. Раньше статус ставился только при enroll и не менялся. Статус из редактирования ноды убран — он не задаётся вручную.
- **Динамичная иконка состояния слева в строке ноды.** Зелёный пульс-хертбит — online; жёлтый воскл. знак — не установлена/в выводе; красный знак запрета — оффлайн/недоступна; серый — выключена/выведена. Пульс анимируется только в зелёном состоянии.
- **Перезагрузка — только для online-нод.** Кнопка рестарта показывается лишь когда нода реально на связи (рестарт идёт через воркер).

### Просмотр организаций: инфраструктура (ноды + школы→ноды)
- **Модалка «Инфраструктура» у организации.** В разделе «Организации» консоли платформы кнопка «Инфраструктура» → эндпоинт `GET /api/platform/nodes/org-overview/{org_id}`: ноды организации (адрес/статус/ёмкость) + таблица школ с привязкой к нодам (поддомен, версия, статус, нода+IP, пометка «пул» для школ на общих нодах).

### OTA-удобства: автоподтягивание версии, ссылки на репо, инструкции в модалках
- **Автоподтягивание версии из репозитория.** Кнопка «⟳ Подтянуть последнюю версию» в форме публикации релиза → `POST /api/platform/ota-config/fetch-latest`: ядро спрашивает у GitHub последний коммит по папке тенанта (с токеном для приватного репо) и заполняет версию/образ/коммит/changelog + даёт ссылки на коммит и код. Новые поля конфига: `source_repo`, `tenant_path`.
- **Ссылки на новые версии.** В таблице релизов — кликабельный коммит и ссылка «код ↗» на папку тенанта в репозитории на нужном коммите. В форме публикации — ссылки на источник.
- **Инструкции в модалках по кнопке (не аккордеоны).** «Источник обновлений» → кнопка «Инструкция» открывает модалку; FAQ доменов в орг-консоли — тоже модалка по кнопке вместо `<details>`.

### Ноды: питание (вкл/выкл/рестарт), массовые действия, прозрачность
- **Вкл/выкл ноды (визуально).** Поле `Node.enabled` (миграция `0021`); выключенная нода не используется планировщиком (`find_best_node` пропускает `enabled=false`), но физически работает. Кнопка-питание в строке ноды + индикатор «выключена». Статус по-прежнему ставит воркер сам.
- **Перезагрузка стека ноды.** Кнопка-рестарт → `POST /platform/nodes/{id}/restart` → воркер (`/agent/restart`) перезапускает докер-контейнеры школ (`DockerClient.restart_managed_containers`). Физический сервер не трогается.
- **Массовые действия.** `POST /platform/nodes/bulk` (action: enable/disable/restart; scope: all/pool/org) + дропдаун «Действия ▾» в тулбаре (все / общий пул / по организации).
- **Прозрачность ноды.** Кнопка-глаз → модалка «Школы на ноде»: для каждой школы поддомен, кастомные домены, IP ноды, версия тенанта, организация, статус. Эндпоинт `GET /platform/nodes/{id}/schools` обогащён этими полями.

### Ноды: редактирование, чистка визарда, русский скрипт
- **Редактирование ноды.** Новая модалка `EditNodeModal` (кнопка-карандаш в строке ноды): имя, страна, домен/IP, порт, лимит школ, статус. Бэкенд `PATCH /platform/nodes/{id}` расширен полями `hostname`/`ssh_port`/`country_code` (с проверкой уникальности hostname). Раньше редактировать ноду было нельзя — модалки не было.
- **Убрано обманное поле Secret Key из мастера.** Оно было декоративным (генерировалось на фронте и никуда не отправлялось) — реальный `SECRET_KEY` скрипт генерирует сам на сервере (`openssl rand`). Подсказка мастера уточнена: ключи создаёт скрипт, вводить ничего не нужно.
- **Скрипт развёртывания ноды переведён на русский.** Все шаги, логи и итоговая справка `node-bootstrap.sh.tmpl` — на русском. Токен подключения вшит в скрипт (интерактивного ввода нет), запуск под root: `bash perum-node-*.sh`.

### OTA школ по кнопке — доведено до красоты
- **Акцентная кнопка обновления.** «↑ Обновить → версия» теперь зелёная и заметная; во время установки показывает «Обновляю…».
- **Индикатор установки.** У школы в статусе `updating` рядом — пульсирующий синий индикатор «устанавливается…». Вместе с баннером «Доступно обновление + changelog» и авто-поллингом статуса (`updating → active/failed`, volume-preserving, авто-откат) — полный наглядный цикл OTA.

### OTA — настраиваемый источник обновлений + приватный реестр
- **Источник OTA в консоли платформы.** Новый раздел «Источник обновлений (OTA)» в разделе «Релизы»: реестр, репозиторий/образ, флаг «приватный», логин и GitHub-токен (PAT `read:packages`) для приватного реестра. Эндпоинты `GET/PUT /api/platform/ota-config` (platform_admin).
- **Токен реестра шифруется at-rest.** Новая таблица `platform_settings` (key-value, `EncryptedString`) — миграция `0020_platform_settings`. Токен наружу не отдаётся (в ответе только `token_set: bool`), есть кнопка удаления токена.
- **Инструкции в UI.** Аккордеон «Как настроить (приватный репозиторий)»: создание PAT, заполнение полей, `docker login`, авто-регистрация релиза через CI.

### Статусы школ + связка с нодами
- **Связка школа↔нода в списке школ.** `GET /api/schools` обогащён `node_name`/`node_hostname` (одним JOIN-запросом) — видно, на каком сервере крутится каждая школа.
- **Живые индикаторы состояния.** Компонент `SchoolStatus`: цветная точка + подпись с учётом heartbeat (онлайн/офлайн) и переходных статусов (разворачивается/обновляется — с пульсацией), заморожена/архив/ошибка. В таблице школ колонки «Статус»+«Онлайн» объединены в «Состояние», добавлена колонка «Нода».

### DNS/домены — экосистема подключения доменов школ
- **DNS-инфо школы.** Новый эндпоинт `GET /api/schools/{id}/dns` отдаёт реальный адрес ноды, где крутится школа (цель DNS-записи), дефолтный поддомен платформы (`<slug>.<base>`) и тип записи (`A` если адрес — IP, иначе `CNAME`).
- **Модалка «Домены» переписана.** Карточка адреса школы (работает сразу), таблица DNS-записей с кнопками копирования (`@`/`*` wildcard/`www`), привязка своего домена, FAQ-аккордеон (поддомен/свой домен/wildcard/лендинг по домену). Раньше был только список без инструкций.
- **Таблица «Где крутятся школы» — реальные данные.** Адрес и DNS-цель ноды берутся из бэкенда per-school (`/dns`), а не хардкод `avari-land.ru`/`orgNodes[0]`.

### CI/CD — авто-деплой control plane + усиление OTA-гейтинга
- **Авто-деплой ядра и веба на прод.** В `release.yml` добавлен job `deploy`: на push в `main`, меняющий `perum-core/**` или `perum-web/**`, по SSH делает `git pull` + `docker compose pull/up -d` control plane (ядро при старте само мигрирует БД). Гейтится переменной `DEPLOY_ENABLED=true` — без неё пропускается. Секреты: `DEPLOY_SSH_HOST/USER/KEY/PORT`, переменная `DEPLOY_PATH`.
- **Фикс авто-обновления прода.** Убран хардкод `pull_policy: never` для `perum_core`/`perum_web` в `docker-compose.prod.yml` — он оверрайдил `*_PULL_POLICY=always` из `.env.prod` и физически не давал прод-стеку подтянуть свежий образ из GHCR.
- **OTA тенанта — релиз только при изменении кода тенанта.** Детектор изменений `release.yml` гейтит публикацию релиза на путь `perum-tenant/**`. От «пустых» OTA (тот же образ/коммит) защищает бэкенд (`publish_release_record` отклоняет дубль). Negation-паттерны в paths-filter НЕ применяются — у него OR-семантика, из-за которой они ломают детекцию.

### Исправления инфраструктуры
- **Фикс 500 на bootstrap-скрипт (aware/naive datetime).** `node_bootstrap` создавал `expires_at` токена как timezone-aware (`datetime.now(timezone.utc)`), а колонка `enrollment_tokens.expires_at` — `DateTime` без таймзоны → asyncpg падал «can't subtract offset-naive and offset-aware datetimes». Заменено на naive `datetime.utcnow()` (как везде в проекте).
- **Фикс длины ID миграции.** Ревизия `0018_nullable_enrollment_token_org` (34 симв.) не влезала в `alembic_version.version_num` (`varchar(32)`) — ломала `alembic upgrade` на чистом деплое (и проде). Переименована в `0018_nullable_token_org`.
- **Фикс 500 на генерацию bootstrap-скрипта.** `enrollment_tokens.org_id` сделан nullable (миграция `0018_nullable_token_org`) — pool-ноды без организации больше не вызывают IntegrityError.
- **Фикс пути шаблона в Docker.** Шаблон `node-bootstrap.sh.tmpl` скопирован в `perum-core/deploy/scripts/` (в Docker build context). `TEMPLATE_PATH` исправлен — теперь 3 уровня вверх от сервиса, а не 4. Dockerfile дополнен `COPY deploy ./deploy`.
- **Редизайн карточек нод (итерация 1).** Строчный layout, точка online/offline, бары CPU/RAM/Диск — заменён финальным Remnawave-UI выше.

## 2026-06-18

### Инфраструктурное управление
- **Модель нод и multi-server.** Новая таблица `nodes` — серверные ноды (CPU/RAM/Disk, статус, привязка к организации). Таблица `node_assignments` — какая школа на какой ноде. `update_history` — история OTA-обновлений школ.
- **Agent API.** Расширен agent-роутер: нода принимает команды от ядра (provision/update/suspend/deprovision школ через HTTP). `RemoteNodeClient` — HTTP-клиент для управления удалёнными нодами.
- **Capacity Planning.** `NodePlanner` — автоматически рассчитывает сколько школ помещается на ноду, даёт рекомендации по sizing (S/M/L/XL ноды), выбирает наиболее свободную ноду для новой школы.
- **Bootstrap-скрипты.** Шаблон `deploy/scripts/node-bootstrap.sh.tmpl` — автоматическая установка Docker, firewall, развёртывание агента на новом сервере. Генератор `node_bootstrap.py` формирует скрипт с enrollment-токеном.
- **Тарифные лимиты.** `organizations` расширена: `plan_tier`, `max_schools`, `max_custom_domains`, `custom_landing_enabled`, `max_nodes`. Enforcement в `schools.py` и `billing.py` — проверка при создании школ и добавлении доменов.
- **OTA-прозрачность.** Функция `update_school` записывает `UpdateHistory` (from_version → to_version, статус success/failed/rolled_back, timing). Эндпоинты: история обновлений школы, текущий релиз, доступные обновления.
- **UI-интеграция.** Platform admin: секция «Инфраструктура» — список нод, capacity bar, рекомендации по sizing, создание ноды, скачивание bootstrap-скрипта. Org admin: «Моя инфраструктура» — серверы, загрузка, карта школ.

### Документация
- `docs/INFRASTRUCTURE.md` — архитектура нод, multi-server, capacity planning, мониторинг.
- `docs/NODE_DEPLOYMENT.md` — пошаговое руководство развёртывания ноды.
- `docs/OTA_UPDATES.md` — OTA для ядра и организаций, rollback, история.
- `docs/TARIFFS_AND_LIMITS.md` — тарифы (trial/basic/pro/enterprise), лимиты, enforcement.
- `docs/DOMAINS.md` — обновлён: тарифные лимиты доменов и лендингов.

## 2026-06-13

Доводка по итогам аудита иерархии ядро→организация→школа: аудит закрыт, изоляция и сохранность данных усилены, ручной биллинг доведён до автоматического контура, обновление школ переведено в фон, релизы привязаны к реальному коду. Архитектура зафиксирована как silo-per-SCHOOL: каждая ШКОЛА — отдельный docker-стек (app + БД + том), School — ребёнок Organization (`School.org_id`); школы провижинит и обновляет узел организации, ядро держит только метаданные и внутрь школьных данных не заходит.

### Аудит иерархии закрыт
- Все находки аудита ядро→организация→школа (см. [архивный аудит](docs/archive/audits/AUDIT_2026-06-12.md)) отработаны и закрыты.
- **RBAC defense-in-depth.** Гарды стоят на самих роутерах, а не только в `include_router`: `organizations`/`billing` → `require_platform_admin`, `schools` → `require_org_admin`. Даже при ошибке подключения роутера доступ остаётся защищён.
- **Конкурентность.** Добавлен `app/core/locks.py` — keyed asyncio-локи на жизненный цикл школы (а также на enforcement и каскады по организации). Параллельные create/update/delete по одной школе больше не наступают друг на друга.

### Безопасность и сохранность данных
- **docker_proxy.** Ядро БОЛЬШЕ не монтирует `/var/run/docker.sock`. Сокет (read-only) подключён только к отдельному сервису `docker_proxy` (`tecnativa/docker-socket-proxy` с фильтром разрешённого API), а ядро ходит к демону по `DOCKER_HOST=tcp://docker_proxy:2375`. Полный вынос управления стеками в отдельный org-agent — задача будущего этапа мульти-сервера.
- **Разведение токенов (изоляция RPC).** Внутренний RPC-токен школы (`SchoolSecret.internal_rpc_token`) теперь отделён от телеметрийного (`telemetry_token`); миграция 0013. Ядро шлёт оба заголовка, а тенант с заданным `INTERNAL_RPC_TOKEN` принимает на `/internal` ТОЛЬКО его (телеметрийный токен на внутренние RPC больше не пускает). Сравнение токенов — constant-time.
- **Подтверждение purge + бэкап вложений.** Безвозвратное удаление (`purge`) школы или организации требует `?confirm=<slug>`. Перед purge снимается бэкап и БД (`pg_dump`), и вложений (tar appdata-тома с проверкой валидности gzip); при сбое любого из бэкапов тома данных НЕ удаляются.

### Биллинг
- **Авто-заморозка по расписанию.** Фоновая петля в lifespan ядра периодически (интервал `BILLING_ENFORCE_INTERVAL_S`) применяет enforcement: просроченные организации автоматически приостанавливаются (их школьные стеки останавливаются через механизм заморозки R1), без ручного дёрганья `POST /api/billing/enforce`.
- **Дебиторка.** Открытые (неоплаченные) счета сводятся в отчёт; добавлен `GET /api/billing/receivables` для platform_admin.
- **Read-only биллинг при приостановке.** Даже приостановленная за неоплату организация сохраняет доступ на чтение к своему биллингу: `GET /api/org/billing` под `require_org_admin_billing` (план/лимит/использование/подписка/счета видны, чтобы было что и как оплатить).
- **Запрет понижения плана ниже использования.** Понизить план до уровня ниже фактического использования (например, школ больше, чем лимит нового плана) нельзя; перекрыть можно только осознанно через `?force=true`.

### Async-обновление школ
- Операции `create`/`reprovision`/`update` школы теперь возвращают `202` и запускают фоновую asyncio-задачу (своя сессия БД + school-лок), а не держат HTTP-запрос на всё время разворачивания стека. Орг-консоль поллит статус школы.
- Пароль администратора школы больше НЕ возвращается в ответе на create — выдаётся через «Админы» → сбросить пароль.

### Релизы привязаны к реальному коду + авто-changelog в кабинетах
Подробности — в новом [docs/RELEASING.md](docs/RELEASING.md).
- **Релиз тенанта привязан к реальному коду.** У релиза появился `Release.source_commit` (миграция 0014); `publish` отклоняет релиз, чей образ/коммит совпадают с текущим (нет реального обновления — нечего публиковать).
- **CI release.yml.** На push в `main` paths-filter собирает и пушит в GHCR ТОЛЬКО изменённые образы (`perum-core`/`perum-tenant`/`perum-web`) с тегами `git-<sha>` и `latest` — образы обновляются независимо друг от друга.
- **Авто-регистрация релиза и changelog.** CI сам регистрирует релиз тенанта (`POST /api/ci/release` по `RELEASE_PUBLISH_TOKEN`) и формирует changelog из `git log`. Ченджлоги видны в кабинетах: в консоли ядра — таблица релизов (версия/образ/коммит/changelog), в орг-консоли — баннер «Доступно обновление» с changelog.
- Миграции control-БД доведены до 0014; `ci.yml` гоняет pytest ядра, pytest тенанта (`tests/unit`) и `tsc` веба.

### Улучшение интерфейса ученика
- **Диаграмма «Средний балл по предметам» (успеваемость).** Переработан горизонтальный bar-чарт во вкладке «Успеваемость» кабинета ученика: градиентная заливка баров (зелёный→фиолетовый→жёлтый→красный по порогам 4.5/3.5/2.5), анимированное появление (`easeOutQuart`, 800ms), улучшенный tooltip с отображением отклонения от общего среднего, вертикальная reference-line общего среднего балла через `chartjs-plugin-annotation`, сортировка предметов по убыванию среднего балла, улучшенная стилизация карточки (тени, градиентный фон, бейдж общего среднего в заголовке). Файл: `perum-web/src/app/student/schedule/_components/AnalyticsDashboard.tsx`.

### Исправление багов клиент-серверного контракта
- **403 на дашборде ученика.** `useStudentDashboard.ts` вызывал `/journal/subjects` (только для учителей) — исправлено на `/subjects` (доступно всем ролям). Дашборд ученика больше не падает с ошибкой при загрузке рейтинга.
- **404 на ассетах маркета.** Созданы 7 недостающих SVG-файлов в `perum-web/public/market/` (avatars/pixel|cosmo|gold, bg/neon, gifts/star|cup|badge) — пути в seed-данных теперь ведут к реальным файлам, изображения товаров отображаются.
- **Отсутствующие backend-эндпоинты для учителей.** Добавлены в `perum-tenant/app/modules/teacher/`:
  - `GET /api/teacher/diary` — недельное расписание учителя по всем его классам (ранее 404, ломало вкладку «Расписание»)
  - `GET /api/teacher/my-class` — страница «Мой класс» классного руководителя (ранее 404)
  - `POST /api/teacher/my-class/bulk-balance` — массовое начисление ливок (ранее 404)
  - `GET /api/teacher/works` — заглушка вкладки «Работы» (ранее 404)
- **Topic CRUD.** Добавлены `POST/PUT/DELETE /api/journal/topics` (создание/редактирование/удаление тем) в `perum-tenant/app/modules/journal/` — страница «Темы учебных занятий» теперь полностью функциональна.

## 2026-06-12

Аудит связки ядро→организация→школа (см. [архивный аудит](docs/archive/audits/AUDIT_2026-06-12.md)): закрытие критических дыр (P0), лендинг на корневом домене ядра (R4), полноценное управление из ядра (R1) и управление админами школ (R5).

### Безопасность и сохранность данных (P0)
- **Захват хоста платформы закрыт.** Slug школы теперь валидируется как и slug организации (паттерн + резерв-лист `admin/api/www/...`); Caddy-`add_route` дополнительно отклоняет платформенные хосты (`admin.<base>`, апекс). Раньше `org_admin` мог создать школу со slug=`admin` и перехватить консоль платформы.
- **Удаление организации каскадирует на её школы.** Снимаются стеки всех школ (лейбл `sch-<slug>`), иначе после удаления орг оставались работающие «школы-призраки».
- **Бэкап перед удалением + двухфазное удаление.** Перед безвозвратным `purge` снимается `pg_dump` школы в том `perum_backups`; архивация (без purge) больше НЕ удаляет тома данных — школу можно поднять обратно.
- **Обход rate-limit логина закрыт.** Реальный клиентский IP берётся из последнего хопа `X-Forwarded-For` (его дописывает Caddy), а не из подделываемого первого. В ядре и тенанте.
- **On-demand TLS ужесточён.** `/internal/validate-domain` больше не пропускает любой `*.<base>` — только апекс, `admin.<base>` и зарегистрированные домены школ/орг. Закрывает выпуск сертификатов на мусорные поддомены от сканеров.
- **Прод-секреты:** `deploy/.env.prod` добавлен в `.gitignore`; пароль control-БД параметризован `CONTROL_DB_PASSWORD` (был захардкожен `perum/perum`).
- Явный healthcheck app-контейнера школы (раньше — только из образа). Починен healthcheck `perum_web` (busybox `wget` + `localhost`→IPv6 → вечный `unhealthy`; теперь `127.0.0.1`).

### Лендинг на корневом домене ЯДРА (R4)
- Лендинг теперь рендерится ТОЛЬКО на апексе (корневом домене ядра), а не на корне каждого школьного поддомена. На школьных хостах `/` ведёт на вход школы (или дашборд, если уже авторизован). Апекс рендерится «голым», вне `AuthProvider` (раньше SSR корня отдавал «Загрузка…» — нулевой SEO).
- Блок апекса добавлен в `Caddyfile.prod` (`/api` → ядро, остальное → веб, обычный ACME-сертификат).
- **Форма «Связаться» больше не теряет лиды.** Реализован публичный `POST /api/contact` (таблица `contact_leads`, миграция 0008, honeypot + троттлинг); `GET/PATCH /api/contact` для `platform_admin`. Раньше форма била в несуществующий эндпоинт → все заявки терялись (404).
- `NEXT_PUBLIC_BASE_DOMAIN` (build-arg) — чтобы отличать апекс ядра от кастомного домена школы.

### Полноценное управление из ядра (R1)
- **Заморозка/разморозка организаций и школ.** Статус `suspended` + `suspended_at` (миграция 0009). Заморозка останавливает контейнеры (тома сохранены) и подменяет Caddy-маршрут школы на страницу «приостановлено» (503); разморозка поднимает обратно. Заморозка организации каскадом замораживает все её школы. `org_admin` приостановленной орг получает 403 на входе и на любом запросе.
- **Редактирование без репровижининга:** `PATCH /api/organizations/{slug}` и `PATCH /api/schools/{id}`.
- **Управление учётками `org_admin`** (platform_admin): список, правка, деактивация, удаление, сброс пароля.
- UI консоли платформы: колонка «План» + действия заморозить/разморозить/удалить организацию.

### Управление администраторами школ (R5)
- **Реализованы** `GET/POST/PATCH/DELETE /api/schools/{id}/admins` и `.../reset-password` (ядро, под `require_org_admin`, скоуп `org_id`). Ядро проксирует во внутренний RPC стека школы (`/internal/school-admins`, telemetry-token) — внутрь данных школы не заходит. Инвариант: нельзя удалить/деактивировать последнего активного администратора школы.
- UI орг-консоли: панель «Админы» у каждой школы (список, добавление, сброс пароля с показом временного, деактивация, удаление).
- Это закрывает пробел из записи 0.0.32, где путь `/api/admin/schools/{id}/admins` был заявлен, но не существовал (аудит, находка 2.8). Фактический путь — `/api/schools/{id}/admins`.
- **Статистическая часть R5** (org_admin видит метрики по школам) пока НЕ реализована — требует телеметрии школа→ядро (R3).

### Телеметрия и статистика (R3)
- **Реализована телеметрия школа→ядро.** Тенант раз в `TELEMETRY_INTERVAL_S` (60с) шлёт в ядро агрегаты БЕЗ PII (пользователи по ролям, число оценок, средний балл, активные за 24ч, сумма ливок) на публичный `POST /api/telemetry` с per-school telemetry-token. Ядро хранит последний снимок на школу (`school_metrics`, миграция 0011) + `last_heartbeat`.
- **Статистика для platform_admin:** `GET /api/platform/stats` (сводка по платформе + разрез по организациям) и `GET /api/organizations/{slug}/stats` (по школам орг).
- **Статистика для org_admin (закрывает стат-часть R5):** `GET /api/schools/stats/overview` (сводка по своим школам) и `GET /api/schools/{id}/stats`. Агрегаты, не данные — инвариант «внутрь школы не заходит» сохранён.
- **Живость школ:** `online` определяется свежестью heartbeat, а не строкой статуса в БД (закрывает претензию «упавшая школа навсегда active»). Prometheus: `perum_school_up{org,school}`, `perum_school_students`, `perum_school_users`.
- UI: KPI-карточки в консоли платформы (организации/школы/онлайн/пользователи/ученики/учителя/оценки/активность) и в орг-консоли (+ колонки «Ученики»/«Онлайн» по школам).
- Hardening (по адверсариальному ревью): `/api/telemetry` закрыт от интернета в `Caddyfile.prod` (тенанты ходят в ядро по docker-сети) + IP-троттлинг; единый 401 при неизвестной школе/неверном токене (без оракула существования); фоновая петля корректно дожидается отмены при shutdown. Интеграционный тест `collect_metrics` на in-memory sqlite (точные агрегаты + пустая школа + отсутствие PII); `aiosqlite` вынесен в `requirements-dev.txt`, CI обновлён.

### Биллинг (R2)
- **Реализован ручной биллинг-контур.** Модели `Subscription` (триал/`paid_until`/статус) и `Invoice` (миграция 0012); цены планов (₽/мес); пробный период 14 дней при создании орг; отсрочка 3 дня после истечения. Структурно готов под платёжный провайдер (ЮKassa): `Invoice.provider/provider_ref`, ручной платёж = счёт `status='paid'`; интеграция счёт+webhook — следующий шаг.
- **Связь оплаты со статусом:** `require_billing_ok` — просроченная орг получает 402 при создании/реправижининге школ (просмотр и оплата остаются доступны). `POST /api/billing/enforce` (platform_admin или внешний cron) приостанавливает просроченные организации (их школьные стеки останавливаются через механизм заморозки R1).
- **Эндпоинты:** платформенные `GET/PUT /billing`, `POST /billing/charge`, `GET /billing/invoices`, `POST /api/billing/enforce`; для org_admin — `GET /api/schools/billing` (read-only: план/лимит/использование/подписка — закрывает «org_admin не видит свой план»).
- **Закрыты находки аудита:** план валидируется при создании орг (был «принимается произвольная строка»); обход лимита через возрождение archived/reprovision закрыт (`_enforce_school_limit` во всех путях); понижение плана ниже использования возвращает предупреждение.
- UI: выбор плана при создании; биллинг-панель платформы (план, смена, «отметить оплату», счета, «проверить просрочки»); биллинг-строка + баннер просрочки в орг-консоли.
- Hardening (по адверсариальному ревью): **оплата авто-размораживает** организацию, приостановленную за неоплату (цикл «просрочил→оплатил→работаю» замыкается); предупреждение о понижении плана теперь реально показывается (читалось из ответа PUT, а не GET); оплата бесплатного плана отклоняется (400); `months` ограничен 1..120; `get_or_create_subscription` устойчив к гонке двойного создания; панель биллинга не виснет на «Загрузке…» при ошибке.

### Полнота R6 (геймификация) и зачистка мёртвого кода
- **Admin-CRUD квестов** (`GET/POST/PUT/DELETE /api/quests`, под `require_admin`, скоуп школы) — раньше QuestManagement звал несуществующий бэкенд.
- **Admin-биржа** (`/api/exchange/admin/*`: settings get/put, windows list/toggle, investments list/refund/refund-all, logs) — под `require_admin`.
- **Admin-маркет** (`/api/admin/market/*`: items CRUD + archive/restore, загрузка картинки, transactions, inventory-stats) + публичная отдача картинок `/api/market/images/{file}` (через `/api`, защита от traversal). Пулы апгрейд-ассетов/бандлов подарков и ZIP-загрузка пока НЕ реализованы (нужны новые модели) — основной маркет функционален.
- **Удалён мёртвый сегмент `/system-admin`** (звал несуществующий `/api/system/*`) и роль `system_admin` вычищена из roles/middleware/Header/AuthContext/types.
- **Сквозной доступ platform_admin к школам:** `GET /api/organizations/{slug}/schools` и `/schools/{id}` (метаданные + телеметрия) — org-скоуп org_admin не затронут.

### Прочее (зачистка по аудиту)
- Tenant: строгая проверка скоупа в `user_admin._get_scoped` (раньше пропускала `school_id IS NULL`); убран мёртвый `org_admin` из `_is_admin` в journal/teacher (латентный риск изоляции).

## [0.0.32] — 2026-05-25

### Изменено (исправлена роль-модель: `org_admin` = управляющий слой над школами)
- **`org_admin` теперь управляет ШКОЛАМИ и АДМИНАМИ отдельных школ — и не заходит внутрь школы.** Он относится к школам так же, как ядро ПЭРУМ относится к организациям: создаёт/настраивает школы, заводит и снимает администраторов каждой школы, видит сводку — но журнал/оценки/пользователей/расписание ведёт **администратор школы** в своём изолированном кабинете.
- **`school_admin`/`director`** — полный администратор **одной** школы, заперт в своей школе и не видит другие.
- Кабинет `org_admin` стал отдельной **консолью школ** (список школ + по каждой управление её администраторами), без внутришкольного сайдбара.

### Удалено
- Ошибочный механизм из 0.0.31 — «переключатель школ» + заголовок `X-School-Id`, которым `org_admin` оперировал данными любой школы. Это нарушало изоляцию и не соответствовало роли. Школы остаются изолированы **логически** (один стек на орг, разделение по `school_id`).

### Технические детали
- RBAC: `require_admin` = {school_admin, director}, `require_teacher` без org_admin; `org_admin` — только `require_org_admin`. Внутришкольные эндпоинты теперь возвращают `org_admin` 403.
- Управление админами школ: `GET/POST/DELETE /api/admin/schools/{id}/admins` (под `require_org_admin`). Удалены ASGI-middleware `school_context` и `X-School-Id` (бэк + apiClient).
- Фронт: `OrgConsole` для `org_admin`; `/admin` разветвлён по роли; пункт «Школы» убран из школьного сайдбара. Сид: `school_admin` `zavuch1` для школы 1.
- Проверено E2E: `org_admin` внутрь школы → 403, но управляет школами/админами; `school_admin` видит только свою школу (zavuch1→школа 1, созданный zavuch2→школа 2); создание/снятие админа школы.

## [0.0.31] — 2026-05-25

### Добавлено (Фаза 5 — управление несколькими школами; **теперь Фаза 5 закрыта по-настоящему**)
- **Несколько школ в организации.** `org_admin` (администратор организации) создаёт, переименовывает, деактивирует и удаляет школы своей орг, видит по каждой сводку (ученики/учителя/классы). В шапке админки появился **переключатель школ**: выбранная школа определяет, под какой школой работают все экраны (обзор, журнал, аналитика, пользователи, расписание). В демо `acme` теперь 2 школы.

### Исправлено
- Раньше весь tenant-апп был жёстко привязан к **одной** школе (`org_admin` всегда резолвился в «первую школу»), а CRUD школ отсутствовал — то есть ключевая функция `org_admin` «управлять своими школами» не работала. Заявление о «закрытии Фазы 5» в 0.0.30 было преждевременным; теперь пробел закрыт.

### Технические детали
- `app/core/school_context`: ContextVar + чистый ASGI-middleware читает заголовок `X-School-Id`; `resolve_school_id` у org-уровневого пользователя (school_id NULL) уважает выбранную школу (в silo любая школа принадлежит этой орг). Роли с фиксированной `school_id` заголовок игнорируют.
- `require_org_admin`; `service_schools` + маршруты `GET/POST/PUT/DELETE /api/admin/schools` (метрики; удаление непустой школы запрещено). Сидер: вторая демо-школа (1 класс + 2 ученика).
- Фронт: `apiClient` добавляет `X-School-Id` из `localStorage`; компонент `SchoolSwitcher` в `admin/layout` (только для `org_admin`).
- Проверено E2E: scoping школа №1 (24 ученика/222 оценки) vs школа №2 (2/0) на overview и users; CRUD школ; гварды (учитель→403, удаление непустой→400).

## [0.0.30] — 2026-05-25

### Добавлено (Фаза 8 — апелляции; **Фаза 8 закрыта**)
- **Апелляции на оценки.** Ученик или родитель оспаривает оценку с указанием причины; учитель-автор оценки или администрация одобряет/отклоняет с комментарием. Раздел «Разбор апелляций» в админке стал рабочим (был заглушкой): список со статусами, кнопки «Одобрить»/«Отклонить». В демо `acme` — 2 апелляции на рассмотрении.

### Добавлено (Фаза 5 — хвосты; **Фаза 5 закрыта**)
- **Управление пользователями.** Список и поиск (с фильтром по роли и пагинацией), редактирование (логин/ФИО/отчество/почта/телефон/пароль), удаление, начисление/списание ливок (с записью в историю), просмотр кошелька пользователя, ученики без класса, **массовая регистрация** (с дедупликацией учеников по ФИО и автопривязкой к классу).
- **Редактор расписания.** Полная замена расписания класса с **подгруппами** (название/кабинет/учитель/состав; автосоздание назначения учителю подгруппы; предупреждения о нераспределённых учениках). Расписание учителя (просмотр по дням + полная замена). Массовая синхронизация назначений `teacher-subjects/sync` (контексты «предмет»/«учитель»).

### Технические детали
- Модель `GradeAppeal` (миграция `tenant_0011`), модуль `app/modules/appeals`: `POST /api/appeals` (ученик/родитель), `GET /api/appeals` (ролевой; `?status=`), `POST /api/appeals/{id}/resolve` (учитель-автор/админ). Фронт `admin/appeals` переписан на реальный API.
- Колонки `patronymic`/`phone` у `User` (миграция `tenant_0012`); модуль `app/modules/user_admin`: `GET /api/admin/users[?role=]`, `/users/search`, `/students/no-class`, `PUT/DELETE /users/{id}`, `POST /users/{id}/balance`, `GET /users/{id}/transactions`, `POST /register-users`.
- `school_admin`: `PUT /api/admin/classes/{id}/schedule` (подгруппы → `LessonGroup`/`LessonGroupStudent`), `GET/PUT /teachers/{id}/schedule`, `GET /teachers-by-subject/{id}`, `GET /teachers/{id}/subjects`, `PUT /teacher-subjects/sync`. `ADMIN_ROLES` в `core/roles`.
- Проверено E2E на `acme`: апелляции (список/подача/решение, негатив 403), управление пользователями (CRUD/баланс/транзакции/регистрация), расписание класса с подгруппой (round-trip), sync назначений, расписание учителя; демо-данные после тестов восстановлены.

## [0.0.29] — 2026-05-25

### Добавлено (Фаза 8 — аналитика)
- **Аналитика учителя.** В кабинете учителя — раздел «Аналитика» по классу/предмету за период: KPI (средний балл, всего оценок, доля «плохих»), динамика успеваемости по дням, проблемные темы (взвеш. средний < 3.5), ученики «на внимание», анализ контрольных/самостоятельных работ и список проблемных учеников с разбором (двойки/тройки/низкий балл). Доступ — только к своим классам (классрук или назначение).
- **Аналитика администрации.** Дашборд школы дополнен: посещаемость, отстающие ученики, активность учителей, число ДЗ/контрольных, дневной график среднего балла. Новые вкладки: «Успеваемость» (средний балл школы, распределение, топ/худшие предметы, график) и «Экономика» (доходы/расходы ливок по типам и классам, крупные транзакции, разрез по маркету).
- **Трекинг переходов.** Фронтовый трекер пишет посещения страниц (в стиле веб-аналитики) — основа для будущей статистики посещаемости.
- **Демо.** Засеяны темы по предметам и проставлены оценкам темы/виды работ — вкладки «Проблемные темы» и «Анализ работ» показывают данные (напр. в 6Б тема «Углублённый раздел» — средний 3.33).

### Технические детали
- Модель `PageVisit` (миграция `tenant_0010`); модуль `app/modules/analytics` (router → service), порт из легаси `analytics.py` + `admin_analytics.py`. Учитель: `GET /api/teacher/analytics/{dashboard,topics,works,students/problem}` (`require_teacher` + проверка доступа к классу). Админ: `POST /api/admin/analytics/track` (любая авторизованная роль), `GET /api/admin/dashboard/{deep-economy,performance}` (`require_admin`). Дашборд `/api/admin/dashboard/overview` (school_admin) доведён до полной версии.
- Всё school-scoped: оценки по `Grade.school_id`, транзакции по `Transaction.school_id`. Средний балл — взвешенный `sum(value*weight)/sum(weight)`. Парсинг периода: `YYYY-MM-DD,YYYY-MM-DD` (с фронта), `month-month`, `YYYY-MM`, дефолт 30 дней.
- Проверено E2E на `acme`: все эндпоинты 200; teacher dashboard 10А (ср. 4.09, 55 оценок, динамика по дням); проблемная тема 6Б; works (контрольная); admin overview/performance/deep-economy (распределено 2964 / потрачено 860 ливок, активность учителей); track пишет визит. RBAC-негативы: ученик → аналитика учителя 403, учитель → deep-economy 403.

## [0.0.28] — 2026-05-24

### Добавлено (Фаза 8 — новости, начало)
- **Новости школы.** На главной у всех ролей — лента новостей школы: заголовок, текст, автор, лайки и счётчик прочтений. Ученик отмечает новость прочитанной (счётчик непрочитанного на дашборде уменьшается) и ставит лайк. Администрация (org_admin/директор) создаёт, редактирует и удаляет новости (черновики через `is_published`).
- **Демо.** В `acme` 3 новости.

### Технические детали
- Модели `News` + `NewsLike` + `NewsRead` (миграция `tenant_0009`); модуль `app/modules/news` (router → service), порт из легаси. Ученик: `GET /api/news`, `GET /api/news/unread-count` (`{count, unread_count}`), `POST /api/news/{id}/{like,read}`. Админ (`require_admin`): `GET/POST /api/admin/news`, `PUT/DELETE /api/admin/news/{id}` (есть `has_more` для пагинации). School-scoped. Загрузка медиа — отложена (media хранится как JSON-массив URL).
- Заглушка `/api/news/unread-count` из common-роутера заменена реальной.
- Проверено E2E на `acme`: лента (3), прочитать → непрочитанных 3→2, лайк → счётчик 1/is_liked; админ создал/листинг has_more/правка/удаление; учитель (не админ) на создание → 403.

## [0.0.27] — 2026-05-24

### Добавлено (Фаза 7 — биржа ливок; **Фаза 7 закрыта**)
- **Биржа ливок.** Предметы торгуются как «акции»: их недельный средний балл по классу — это биржевой индекс. Ученик в открытое окно торгов вкладывает ливки в предмет (до 500 за сессию), а при расчёте недели вклад выплачивается с учётом изменения индекса: вырос средний балл — прибыль, упал — убыток. Есть портфель вкладов, история котировок по предмету, лог операций, отмена активного вклада (возврат ливок).
- **Движок котировок.** «Рассчитать неделю» (учитель) считает средние баллы предметов из оценок, сравнивает с прошлой неделей (% изменения) и закрывает активные вклады: выплата = вклад × (1 + изменение/100).
- **Демо.** Настройки биржи в `acme` — окно торгов открыто всю неделю.

### Технические детали
- Модели `SubjectAverage` (недельный индекс), `Investment`, `TradingWindow`, `ExchangeSettings`, `ExchangeLog` (миграция `tenant_0008`); модуль `app/modules/exchange` (router → service), порт из легаси: `GET /api/exchange/{market-data,history/{id},portfolio,logs}`, `POST /invest`, `DELETE /investments/{id}`, `POST /calculate-results`. Вклад/отмена/выплата пишут `Transaction` (exchange_invest/cancel/result). School-scoped; invest/cancel — `require_student`, расчёт — `require_teacher`. Лимит 500/сессия.
- Проверено E2E на `acme`: вклад 100 в «Математику» → средний класса вырос 4.17→5.0 (+19.9%) → выплата 119 ливок (+19); портфель/история/логи; превышение лимита→400; отмена→возврат.
- **Фаза 7 завершена** (рейтинги, маркет, квесты, биржа).

## [0.0.26] — 2026-05-24

### Добавлено (Фаза 7 — квесты)
- **Квесты за учёбу.** На дашборде ученик видит квесты школы: «Отличная неделя» (5 положительных оценок), «Без троек» (серия 4–5), «Ежедневный визит». Берёт квест в работу, прогресс по оценкам считается автоматически; когда цель достигнута — квест «готов», и ученик забирает награду ливками.
- **Демо.** В `acme` добавлены 3 квеста.

### Технические детали
- Модели `Quest` + `UserQuest` (миграция `tenant_0007`); модуль `app/modules/quests` (router → service), порт из легаси: `GET /api/student/quests` (список с пересчётом прогресса), `POST /api/quests/take/{quest_id}`, `POST /api/quests/claim/{user_quest_id}` (и `/complete/{id}`). Прогресс: positive_grades (счёт 4/5 с момента взятия), no_threes (серия). Получение награды пишет `Transaction` (type=quest). Автогенерация квестов по триггерам — отложена (admin-side). Гейт `require_student`, school-scoped.
- Проверено E2E на `acme`: список (available/active), взять (повтор→400), учитель ставит 5 пятёрок → прогресс 5/5 «ready» → забрать (+50 ливок), повторный claim→400, чужой/несуществующий→404.

## [0.0.25] — 2026-05-24

### Добавлено (Фаза 7 — маркет)
- **Магазин за ливки.** Ученик открывает каталог (аватары, фоны, подарки — с редкостью common/rare/legendary), покупает за ливки, видит инвентарь. Аватары и фоны можно надеть/снять — надетый аватар становится аватаром профиля. История покупок — в транзакциях.
- **Правила покупки:** обычные предметы (аватар/фон) — по одному на ученика; подарки — до лимита (`per_user_limit`); проверка баланса и остатка на складе. Можно поставить и «дефолтный» аватар (не из магазина).
- **Демо.** В `acme` 7 товаров (3 аватара, фон, 3 подарка).

### Технические детали
- Модели `ShopItem` + `UserInventory` (миграция `tenant_0006`); модуль `app/modules/market` (router → service), порт ядра легаси-маркета: `GET /api/market/items`, `/items/{id}`, `POST /buy/{id}`, `GET /inventory`, `POST /equip/{inv_id}`, `/unequip/{type}`, `GET /transactions`, плюс `POST /api/user/set-default-avatar`. Покупка атомарно списывает баланс, пишет `Transaction` (type=purchase). School-scoped (товары школы + глобальные). **Отложено** (admin-heavy): улучшения подарков, бандлы, физическая выдача по коду.
- Проверено E2E на `acme`: каталог 7 товаров, покупка (540→440), повтор не-подарка→400, надеть/снять аватар (avatar_url меняется), лимит подарков, нехватка ливок→400, история транзакций.

## [0.0.24] — 2026-05-24

### Добавлено (Фаза 7 — рейтинги, начало)
- **Рейтинг учеников по предмету.** На дашборде ученика — ТОП-10 по среднему баллу за месяц (сезон): значки золото/серебро/бронза за первые три места, своя строка подсвечена. Область: 1–9 классы соревнуются по параллели, 10–11 — внутри профильного класса. Первые 5 дней месяца — «рейтинг формируется» (грейс-период). Если ученик не в ТОП-10 — его позиция показывается отдельно.

### Технические детали
- Модуль `app/modules/leaderboard` (router → service), порт из легаси: `GET /api/leaderboard/{subject_id}?month=&year=`. Запросы school-scoped; тайбрейк avg → кол-во положительных (4–5) → всего оценок. Без Redis-кэша (упрощено). Проверено E2E на `acme`: 6 учеников 5А по «Математике», майский сезон, значки и подсветка себя — корректны.

## [0.0.23] — 2026-05-24

### Добавлено (Фаза 6 — импорт оценок из PDF; **Фаза 6 закрыта**)
- **Импорт журнала из PDF.** Учитель загружает PDF-ведомость в журнал класса: система разбирает таблицу (стратегии с линиями/по тексту, одна битая страница не роняет импорт), показывает найденные даты, сокращения видов работ и список учеников. После того как учитель сопоставил сокращения с видами работ — оценки заносятся в журнал. Режим «replace»: повторная загрузка приводит журнал в точное соответствие файлу по покрытым датам, **ручные оценки не трогаются**, импортированные оценки не начисляют ливки.
- Умное сопоставление: предмет в файле сверяется с журналом (словарь сокращений: «рус яз» = русский язык и т.п.), ФИО учеников матчатся нечётко (инициалы, опечатки), даты проверяются по расписанию предмета.

### Технические детали
- Порт парсера из легаси: `app/services/parsers` (`NormalizationEngine` — разбор ячеек/маркеров/сокращений, `StandardPdfParser` на `pdfplumber`) + `app/modules/grade_import` (валидация превью + исполнение импорта в режиме replace). Эндпоинты `POST /api/journal/import/{analyze,execute}/{class_id}/{subject_id}` (`require_teacher` + проверка назначения). Зависимость `pdfplumber`.
- **23 юнит-теста** на логику парсера (разбор ячеек, пропуск служебных колонок, матчинг предметов/ФИО, полный разбор синтетической таблицы, парсинг дат) — все зелёные. **Оговорка:** в легаси не было образца PDF, поэтому разбор реальной ведомости вживую не проверялся (проверены: вся чистая логика юнит-тестами + проводка эндпоинтов: не-PDF→400, битый PDF→400, чужой учитель→403).
- **Фаза 6 завершена.**

## [0.0.22] — 2026-05-24

### Добавлено (Фаза 6 — кабинет родителя)
- **Родитель видит детей.** Родитель входит на поддомене школы под тестовой учётной записью и видит карточки своих детей (класс, средний балл, число оценок, баланс ливок), а по каждому ребёнку — список оценок и историю операций с баллами. Только чтение.
- **Демо.** В школе `acme` добавлен родитель `parent1`, привязанный к двум ученикам 5А.

### Технические детали
- Модель связи `ParentStudent` (родитель↔ученик) + миграция `tenant_0005`. Модуль `app/modules/parent` (router → service) на путях легаси: `GET /api/parent/children`, `/api/parent/children/{id}/grades`, `/api/parent/children/{id}/transactions`. Гейт `require_parent`; каждый запрос по ребёнку проверяет привязку (чужого ребёнка — 403). `avg_grade` считается по оценкам (1–5), баланс/история — по ливкам.
- Осталось по Фазе 6: импорт оценок из PDF (порт парсера).

## [0.0.21] — 2026-05-24

### Добавлено (Фаза 6 — ДЗ и контрольные)
- **Учитель задаёт домашние задания и контрольные.** Из журнала учитель создаёт/редактирует/удаляет ДЗ (с вложениями — файлом до 13 МБ или ссылкой) и планирует контрольные/самостоятельные работы. Всё это ученик сразу видит у себя в дневнике (ДЗ на уроках предмета, контрольная — в день проведения).
- **Защита от ошибок:** ДЗ нельзя задать на воскресенье или на день, когда у класса нет урока по этому предмету; в один день в классе — не более одной контрольной; нельзя ставить работу на каникулы. Прикреплять/менять может только автор задания или администратор.

### Технические детали
- Модуль `app/modules/coursework` (router → service) на путях легаси: `GET/POST/PUT/DELETE /api/homework`, `POST /api/homework/{id}/attachments` (multipart: файл или `url_link`), `DELETE /api/homework/attachments/{id}`, `GET /api/attachments/{id}/download`; `GET/POST/DELETE /api/control-works`. Запись — `require_teacher` + проверка назначения (teacher_subjects), чтение ДЗ/КР — для ученика ограничено его классом. Добавлена зависимость `python-multipart`.
- **Ограничение:** файлы-вложения пишутся в локальную папку контейнера (не на volume орг) — переживают рестарт, но не пересоздание контейнера; постоянное хранилище файлов — задача Фазы 9. Ссылки-вложения этого ограничения не имеют.
- Осталось по Фазе 6: импорт оценок из PDF, кабинет родителя.

## [0.0.20] — 2026-05-24

### Добавлено (Фаза 6 — кабинет ученика)
- **Ученик видит свои данные.** Ученик входит на поддомене школы под тестовой учётной записью и в разделе «Расписание» получает: **дневник** на неделю (уроки по расписанию звонков, оценки прямо в клетках с цветом, домашние задания, контрольные), **аналитику** оценок по четвертям/полугодиям (средневзвешенные баллы по предметам + средний за год), **сводку** (всего ливок, средний балл по предметам) и **итоговые оценки**.
- **Демо стало полнее.** В школе `acme` теперь у каждого класса есть недельное расписание (раньше — только у 10А), и выставлены итоговые оценки за текущую четверть — чтобы дневник и «итоговые» были с данными у любого ученика.

### Технические детали
- Модуль `app/modules/student` (router → service): `/api/student/diary`, `/api/student/grades`, `/api/student/grades/{summary,analytics,finals}` — порт логики из легаси-роутера расписания, все запросы жёстко ограничены `user.id` (ученик видит только себя).
- Общий модуль `app/modules/common`: `/api/subjects`, `/api/periods` (текущий период + список), `/api/news/unread-count` (заглушка 0 — новости в Фазе 8). Заглушка `/api/student/quests` (квесты — Фаза 7), чтобы лендинг ученика не падал.
- Роль-гейты `require_student` / `require_parent` в `app/core/deps`.
- Осталось по Фазе 6: ДЗ и контрольные (CRUD учителем), импорт оценок из PDF, кабинет родителя.

## [0.0.19] — 2026-05-24

### Документация
- **Журнал версий и оценка готовности.** Добавлен `docs/VERSIONS.md`: счётчик версий по коммитам (`№(N)` + дата/время каждого коммита) и оценка готовности продукта — **≈40–45%** по работающим фичам, с прикидкой сроков (до полнофункционального — ~5–7 ч фокус-работы, до прод-готовности — ~8–12 ч; темп считается по фактическим коммитам, а не по календарным неделям плана). Правило ведения журнала зафиксировано в PROGRESS.

## [0.0.18] — 2026-05-24

### Документация
- **Зафиксирован статус по фазам (роадмап) для будущих сессий.** В `docs/PROGRESS.md` добавлена таблица «Статус по фазам» (готово / частично / не начато) с детализацией, принципами проекта и демо-доступом; в `docs/PLAN.md` проставлены маркеры статуса на всех 11 фазах; в `README.md` обновлена текущая фаза со ссылкой на карту. Теперь новая сессия сразу видит, что сделано и что дальше.

## [0.0.17] — 2026-05-24

### Добавлено (Фаза 6 — журнал и оценки, начало)
- **Журнал учителя работает.** Учитель входит на поддомене школы под тестовой учётной записью, видит свои классы и предметы, открывает журнал класса (ученики × даты), выставляет/редактирует/удаляет оценки. За оценки начисляются ливки (5→+25, 4→+10, 3→−5, 2→−20, 1→−30, с коэффициентами профильности и веса работы) — баланс ученика обновляется, операция пишется в историю.
- **«Обзор школы» ожил** — реальные данные: средний балл, всего оценок, распределение оценок, успеваемость по классам.
- **Демо-оценки.** В школе `acme` выставлено ~216 оценок — журнал и обзор сразу с данными.

### Технические детали
- Модели: Grade, FinalGrade, Transaction (история ливок), Homework, HomeworkAttachment, ControlWork (миграция tenant_0004). Порт `points_calculator` из легаси.
- Эндпоинты (контракт легаси): `/api/journal/*` (журнал класса, оценки, типы работ, предметы/темы), `/api/teacher/*` (классы, предметы, ученики).
- Осталось: итоговые оценки/аттестация, ДЗ и контрольные, кабинеты ученика/родителя, импорт оценок из PDF.

## [0.0.16] — 2026-05-24

### Добавлено (Фаза 5 — учебное ядро, продолжение)
- **Все основные разделы кабинета школы наполнены и работают:** Классы (с классным руководителем и составом учеников), Учителя (с назначениями предмет↔класс), Учебные годы, Периоды (четверти), Расписание звонков, расписание класса. Плюс ранее — Предметы и Виды работ.
- **Школа заполнена тестовыми данными для проверки.** В `acme`: учебный год 2025-2026 + 4 четверти, расписание звонков, 5 учителей, 4 класса (5А, 6Б, 10А, 11А) по 6 учеников, назначения учителей по предметам, недельное расписание для 10А. Исторические demo credentials удалены из документации.

### Технические детали
- Эндпоинты (контракт легаси, RBAC администратора, изоляция по школе): `/api/admin/classes` (+ `/students`, `/schedule`), `/api/admin/academic-years`, `/api/admin/school-periods`, `/api/admin/bell-schedules`, `/api/admin/teachers`, `/api/admin/teacher-subjects`.
- Осталось по разделам: редактирование расписания (с подгруппами), массовое назначение учителей, личные кабинеты учителя/ученика (Фаза 6).

## [0.0.15] — 2026-05-24

### Добавлено (Фаза 5 — учебное ядро, начало)
- **Кабинет школы начал «оживать».** При создании организации теперь сразу заводится школа с базовым набором: 12 предметов (Математика, Русский язык, …) и 6 видов работ (Ответ, Домашняя, Контрольная, …).
- **Работают разделы админки школы:** «Обзор школы» (показатели — пока нули, оценок ещё нет), «Предметы» (просмотр/создание/редактирование/удаление) и «Виды работ» (то же). Остальные разделы (классы, расписание, учебный год, звонки, назначения учителей) — следующими срезами.

### Технические детали
- Перенесены модели учебного ядра из легаси: предметы, классы, расписание уроков, группы, учебные годы, периоды, расписание звонков, темы, назначения учителей, виды работ (13 таблиц, миграция tenant_0003).
- Эндпоинты `/api/admin/subjects`, `/api/admin/work-types`, `/api/admin/dashboard/overview` совместимы с контрактом легаси-фронта; защищены ролью администратора; данные изолированы по школе.

## [0.0.14] — 2026-05-24

### Исправлено
- **Вечная загрузка после входа в школу.** Админ-раздел школы жёстко проверял старый набор ролей и не узнавал новую роль `org_admin` — страница висла на спиннере. Теперь роль распознаётся (через общий хелпер `isAdmin`), после входа открывается кабинет администратора школы. Панели внутри (обзор/классы/предметы и т.д.) пока показывают «не удалось загрузить» — их эндпоинты бэкенда появятся в Фазах 5-8.

## [0.0.13] — 2026-05-24

### Добавлено
- **Вход в школу работает.** Бэкенд организации приведён к контракту, который ожидает перенесённый интерфейс школы: вход (`/api/login`), профиль (`/api/user/me`), выход (`/api/logout`). Теперь администратор организации входит на поддомене своей школы (`<slug>.perum.local`) под выданными при создании логином и временным паролем и попадает в кабинет.

### Технические детали
- Модель пользователя приведена к виду легаси: имя/фамилия, баланс (ливки, пока 0), аватар, флаг смены пароля. Токен входа несёт `id/session_token/role/org_slug` (их читает веб-роутинг по cookie).
- После входа org_admin направляется в админ-раздел школы. Сами разделы (журнал, биржа, маркет, классы, предметы) наполнятся по мере портирования бэкенда из легаси (Фазы 5-8) — пока пустые.

## [0.0.12] — 2026-05-24

### Добавлено
- **Платформенный раздел в новом интерфейсе.** На `admin.perum.local` заработала панель платформы в фирменном тёмном дизайне ПЭРУМ: вход администратора платформы, список организаций и создание новой организации одной формой (с реальным подъёмом её сервера). Школьные поддомены продолжают отдавать перенесённый интерфейс школы.
- **Мультиарендность по адресу.** Один веб-билд обслуживает и платформу, и школы: по имени хоста (`admin.*` → платформа, `<школа>.*` → школьный кабинет) выбирается нужный раздел. Платформенные страницы не используют школьную авторизацию, поэтому отображаются сразу, без «мигания».

> Открыть в браузере: `http://admin.perum.local` → вход `admin`/`admin` → создавать и видеть организации.

## [0.0.11] — 2026-05-24

### Решено
- **Фронтенд берём из легаси.** Дизайн и функционал нового ПЭРУМ воспроизводим из исходников старого приложения (`R1dnis/PERUM`), а не изобретаем с нуля. `perum-web` теперь — копия легаси-фронта (Next.js, тёмная тема, фирменные экраны журнала/биржи/маркета), которая уже собирается в нашем окружении и будет адаптирована под новую архитектуру (мульти-тенант + платформенный раздел). Зафиксировано в PLAN.md, PROGRESS.md, README.
- **Бренд — «ПЭРУМ» (кириллица)** во всём интерфейсе и документации (расшифровка: Платформа Экономико-Аналитического Развития Учащейся Молодёжи). Латиница — только технические имена (`perum-core`/`perum-web`/`perum-tenant`).

### Добавлено
- Веб-прокси (Caddy) теперь на каждом адресе разделяет трафик: `/api` и `/docs` → бэкенд (управляющий сервис или сервер школы), всё остальное → фронтенд. Один фронт обслуживает и платформу, и все школы.

## [0.0.10] — 2026-05-24

### Добавлено
- **Вход внутрь школы (Фаза 2).** У приложения организации появились пользователи и вход. При создании организации система теперь автоматически: создаёт «карточку» организации внутри её базы, заводит первого администратора организации (org_admin) с временным паролем и возвращает эти данные тому, кто создавал (позже — письмом на почту). Администратор может войти на своём поддомене, посмотреть профиль и сменить пароль.
- **Изоляция организаций на уровне входа.** Токен входа жёстко привязан к своей организации: даже если он утечёт, на сервере другой школы он не сработает (проверено — отвечает «не авторизован»). Каждая школа подписывает токены своим секретным ключом, плюс в самом токене зашит идентификатор школы — два независимых барьера.

### Технические детали
- Модели tenant: Organization (мета), School, User (роли org_admin/school_admin/director/teacher/student/parent). Миграция применяется при создании организации.
- Эндпоинты tenant: `/api/auth/login`, `/api/auth/me`, `/api/auth/change-password`, `/api/auth/logout`; внутренний `/internal/bootstrap-org-admin` (защищён токеном телеметрии).
- Провижининг доведён до шагов 8-9 (сидинг дефолтов + создание org_admin). E2E: вход org_admin на своём поддомене работает; кросс-доступ между школами заблокирован (оба барьера проверены).

> Теперь это можно потрогать: создать организацию через `admin.perum.local/docs`, затем войти в неё как org_admin через `http://<slug>.perum.local/docs`.

## [0.0.9] — 2026-05-24

### Добавлено
- **Вход для администратора платформы — Фаза 1 закрыта.** Управляющий сервис теперь защищён: чтобы смотреть, создавать, удалять и пересоздавать организации, нужно войти под учётной записью администратора платформы (логин + пароль → токен доступа). Без токена API организаций отвечает «не авторизован». Первый администратор создаётся автоматически при первом запуске (в dev — `admin`/`admin`, в проде задаётся через настройки).

### Технические детали
- Пароли хранятся как bcrypt-хеши; токены — JWT (срок 7 дней), привязаны к роли `platform_admin`.
- Эндпоинты: `POST /api/auth/login`, `GET /api/auth/me`; весь `/api/organizations` требует токен.
- Новые автотесты (хеширование, JWT, отклонение запросов без токена). Всего автотестов управляющего сервиса — 47.

> Платформу уже можно тестировать руками без фронтенда — через встроенный Swagger UI по адресу `http://admin.perum.local/docs` (войти, нажать Authorize, создавать организации и наблюдать, как поднимаются их серверы). Полноценный веб-интерфейс — Фаза 3.

## [0.0.8] — 2026-05-24

### Решено (зафиксировано в планах)
- **Модель обновлений платформы — «всё по кнопке».** Управляющий сервер выступает «дирижёром»: при выходе новой версии он публикует её вместе со списком изменений, а каждая организация видит уведомление в своей админке и обновляется одной кнопкой, когда сама захочет. Принудительных и автоматических обновлений нет — даже срочные исправления безопасности накатываются только по решению организации. При обновлении пересоздаётся только приложение организации, а её база данных, настройки и данные школ остаются нетронутыми; организации обновляются независимо друг от друга. Для крупных организаций на отдельных серверах (в будущем) управление пойдёт через лёгкий агент на их сервере — по принципу связки Remnawave (панель ↔ нода). Отражено в `docs/PLAN.md` и `docs/DEPLOYMENT.md`.

## [0.0.7] — 2026-05-24

### Добавлено
- **Реальный запуск сервера организации.** Теперь при создании организации система не просто записывает её в базу, а поднимает для неё отдельный изолированный сервер: свою базу данных PostgreSQL, приложение организации и отдельное хранилище. Сразу прописывается адрес-поддомен (например, `acme.perum.local`), и организация становится доступна по нему. Если при запуске что-то идёт не так — система сама убирает за собой все ресурсы и помечает организацию как «ошибка», чтобы можно было попробовать снова.
- **Приложение организации (perum-tenant) — первый каркас.** Появился отдельный образ приложения, которое работает «внутри» каждой организации. Пока умеет немного — отвечать, что живо, и проверять связь со своей базой данных. В следующих фазах наполним его журналом, оценками, биржей и магазином.
- **Управление адресами организаций.** Управляющий сервис сам прописывает и убирает поддомены организаций в веб-прокси (Caddy), а после перезапуска восстанавливает их.
- **Удаление и пересоздание организаций.** Добавлены операции: удалить организацию вместе с её сервером и данными либо пересоздать сервер заново.

### Технические детали
- Управляющему сервису дан доступ к Docker (через сокет), чтобы поднимать серверы организаций.
- Секреты каждой организации (пароль базы, ключ подписи, токен телеметрии) генерируются и хранятся отдельно от основной записи.
- Новые автотесты: проверка сборки описания стека и маршрута прокси. Всего автотестов управляющего сервиса — 40.

> Главное: ключевой шаг Фазы 1 закрыт — создание организации реально разворачивает изолированный сервер и делает его доступным по адресу. Следующее — вход для администратора платформы (защита API).

## [0.0.6] — 2026-05-24

### Добавлено
- Этот журнал изменений. Дальше каждое заметное обновление будет фиксироваться здесь понятным языком.

## [0.0.5] — 2026-05-24

### Добавлено
- Полный план проекта и файл прогресса прямо в репозитории: `docs/PLAN.md` (вся архитектура и 11 фаз разработки) и `docs/PROGRESS.md` (что уже сделано и с чего продолжать в следующий раз). Теперь не нужно держать план в голове или во внешнем инструменте — он едет вместе с кодом.

## [0.0.4] — 2026-05-24

### Исправлено
- Обход блокировки Docker Hub в России. При первом запуске базовые образы (Postgres, Redis, Caddy) не скачивались — соединение обрывалось. Теперь их можно тянуть через зеркало (`mirror.gcr.io`), не трогая системные настройки. Способ описан в `docs/DEPLOYMENT.md`.
- Свой образ control plane теперь собирается локально, а не пытается скачаться из несуществующего реестра.

## [0.0.3] — 2026-05-24

### Добавлено
- Первые автотесты control plane: проверка правил для имён организаций (slug) и базовые проверки работоспособности сервиса. Запускаются без Docker и без базы данных.

### Исправлено
- Тесты сразу нашли и помогли исправить ошибку: имя организации из 3 букв (например, `abc`) ошибочно отклонялось, хотя по правилам должно приниматься.
- Добавлена пропущенная зависимость для проверки email-адресов администратора.

## [0.0.2] — 2026-05-24

### Добавлено
- Первая рабочая версия управляющего сервиса (control plane) — «мозга» платформы, который будет создавать и контролировать серверы организаций.
- Локальный запуск всей связки одной командой: управляющий сервис + база данных (PostgreSQL) + кэш (Redis) + веб-прокси (Caddy).
- Базовое API организаций: создать организацию, посмотреть список, открыть по имени. Имена проверяются на корректность и уникальность; служебные имена (`admin`, `api` и т.п.) запрещены.
- При запуске автоматически создаётся структура базы данных.

> На этом этапе создание организации лишь сохраняет запись в базе. Реальный запуск отдельного сервера под организацию появится в следующих обновлениях.

## [0.0.1] — 2026-05-24

### Добавлено
- Создан новый репозиторий и каркас проекта: три будущих части — управляющий сервис (`perum-core`), приложение организации (`perum-tenant`), веб-интерфейс (`perum-web`) — плюс инфраструктура и документация.
- Подробная архитектурная документация: общая картина, принцип изоляции данных между организациями, как создаётся организация, как работают домены, какие есть роли пользователей, как разворачивать и обновлять систему.
- Зафиксированы ключевые решения: каждая организация получает физически отдельный сервер (максимальная изоляция данных), свой поддомен на `perum.ru` и при желании собственный домен.
