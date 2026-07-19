# Security hardening

## Действующие controls

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
