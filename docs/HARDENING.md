# Security hardening

## Действующие controls

- Occurrence backfill при наличии ambiguity report требует отдельный
  `ambiguity_token`. Отсутствующий или устаревший acknowledgement отклоняется
  `409` до writes; `plan_token` независимо защищает полный plan от TOCTOU.
- School silo: отдельные runtime, DB credentials и persistent volumes.
- Раздельные Core/Tenant token domains и role dependencies.
- Отдельные internal RPC и telemetry tokens; constant-time token checks.
- Docker socket proxy для Core/worker orchestration.
- Encryption wrapper для persisted control-plane secrets при настроенном key.
- Login/discovery rate limits; metrics auth при настроенном token.
- Confirmed backup before destructive school purge.
- Release identity/no-op guards и descriptor fail-closed semantics.
- Descriptor diagnostics доступны только active platform/org operators, скрывают
  cross-org existence и не публикуют school, release или user identity в metrics.
  Process-local bounded counters предназначены для aggregate alerting, но сами по
  себе не являются durable production pilot evidence.
- Support delivery endpoints school/org scoped и возвращают только bounded state,
  counts и durations. Raw outbox payload, transport errors, message content,
  correlation/ticket/user identifiers запрещены; retryable error нельзя называть
  terminal failure без отдельной persisted policy.
- Support Prometheus gauges platform-wide и не содержат labels. Core извлекает
  только allowlisted non-negative integers из fresh telemetry; stale, missing и
  malformed snapshots становятся `unknown`, а не ложным healthy zero.
- Scanner worker принимает verdict только под действующим lease fencing token,
  не удаляет active leases cleanup-ом, ограничивает total operation/evidence и
  signature clock skew. Clean move имеет deterministic crash recovery, infected
  content удаляется только после durable infected state.
- Core scanner provisioning fail-closed проверяет managed internal network и
  exact container image/topology/mount/port/cap/resource/health/security config.
  Per-school relay имеет connection, idle, total lifetime и byte limits,
  non-root user, read-only rootfs, no-new-privileges и PID limit.
- Scanner PostgreSQL gate использует независимые sessions и held row lock для
  доказательства `SKIP LOCKED`; replacement lease обязан победить blocked stale
  worker, который не может записать verdict/evidence/audit. Integration URL берётся
  только из disposable `TEST_POSTGRES_URL`, без production secrets.
- Existing scanner containers fail-closed сверяются также по running state,
  restart policy, privileged/cap-add, exact relay command/environment и exact
  clamd health probe. Relay workflow публикует immutable candidates после
  constrained Docker check с SBOM/provenance; CI не выдаёт approval.
- Signature updates вынесены из internal clamd network: отдельный non-root updater
  имеет только egress network и RW signature volume; clamd имеет только internal
  backend и RO mount. Между updater и scanner нет network path, единственный
  shared state — проверяемые ClamAV database files.
- Clamd сохраняет read-only rootfs и RO signature volume; для INSTREAM temporary
  data разрешён только bounded 16 MiB `/tmp` tmpfs с `noexec,nosuid`, который
  входит в exact Docker drift contract.
- Scanner candidate recreation проверяет не только container health: signature DB
  fingerprint должен сохраниться, updater outage не прерывает scanning, clamd
  outage закрывает request fail-closed, а recreated daemon снова даёт clean/EICAR.
- Signature freshness определяется production Tenant parser по timestamp из
  ClamAV `VERSION`, не по mtime volume. Stale policy блокирует scan как unavailable;
  recovery policy обязана повторно доказать ready/clean/EICAR на том же daemon.
- Bounded fairness gate отделяет 5 school networks, ограничивает каждый relay двумя
  upstream connections и проверяет, что burst одной школы не блокирует peer scans;
  clamd не получает school network, relay mounts отсутствуют, resource ceilings
  сверяются через real Docker inspect.
- Private media quarantine/authorization foundation; attachments остаются
  выключенными без production scanner readiness.

## Known risks

- Dev defaults в compose небезопасны для production и должны переопределяться.
- In-memory limits не обеспечивают глобальный limit для нескольких replicas.
- Node Watchtower имеет raw Docker socket и является privileged host boundary.
- Agent bearer auth не шифрует transport; public network требует TLS/VPN/ACL.
- Полная key rotation/KMS policy и production scanner/delivery adapters требуют
  внешней настройки и дальнейшей реализации.
- Store, device, accessibility и end-to-end rollout gates ещё не завершены;
  текущий status находится в [PRODUCT_MASTER_PLAN.md](PRODUCT_MASTER_PLAN.md).
- Stage F lifecycle gates прошли локальную automation, но successful named CI run
  и production pilot evidence обязательны до расширения rollout.

## Engineering requirements

Новые endpoints получают deny tests по role/scope/ownership. Секреты не попадают
в logs, URLs, docs, fixtures или generated API. Sensitive values хранятся в secret
manager, имеют owner/rotation procedure и считаются compromised после появления в
VCS или conversation. Incident response и rotation: [RUNBOOK.md](RUNBOOK.md).
