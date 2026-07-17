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
