# Документация PERUM

Этот файл — индекс активной документации. Единственный источник текущего
продуктового статуса, процентов и roadmap — [PRODUCT_MASTER_PLAN.md](PRODUCT_MASTER_PLAN.md).
Остальные документы описывают устройство, требования или процедуры и не должны
вести собственный live roadmap.

## Начало работы

- [PRODUCT_MASTER_PLAN.md](PRODUCT_MASTER_PLAN.md) — live progress, handoff и roadmap.
- [ARCHITECTURE.md](ARCHITECTURE.md) — границы Core, school tenant, web, mobile и packages.
- [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md) — локальный запуск.
- [TESTING.md](TESTING.md) — локальные и CI-проверки.
- [API_CONTRACTS.md](API_CONTRACTS.md) — OpenAPI и generated contracts.

## Архитектура и безопасность

- [TENANT_ISOLATION.md](TENANT_ISOLATION.md) — silo-per-SCHOOL и уровни авторизации.
- [ROLES.md](ROLES.md) — роли Core и tenant.
- [DOMAINS.md](DOMAINS.md) — домены, discovery и маршрутизация.
- [INFRASTRUCTURE.md](INFRASTRUCTURE.md) — control-plane host и optional remote nodes.
- [WORKER.md](WORKER.md) — `ROLE=org_agent` и Agent API.
- [HARDENING.md](HARDENING.md) — действующие security controls и остаточные риски.

## Операции

- [PROVISIONING.md](PROVISIONING.md) — создание организации, ноды и школы.
- [NODE_DEPLOYMENT.md](NODE_DEPLOYMENT.md) — bootstrap remote node.
- [RUNBOOK.md](RUNBOOK.md) — deploy, backup, restore, incidents и secrets.
- [RELEASING.md](RELEASING.md) — CI, images, control-plane deploy и tenant updates.
- [OPERATOR_EVIDENCE_2026-07-30.md](OPERATOR_EVIDENCE_2026-07-30.md) — non-secret production seed/deploy evidence.
- [MIGRATION_FROM_LEGACY.md](MIGRATION_FROM_LEGACY.md) — рамки будущей миграции.

## Product specifications

- [DYNAMIC_MOBILE_DESCRIPTOR_PLAN.md](DYNAMIC_MOBILE_DESCRIPTOR_PLAN.md) — descriptor requirements и Stage F acceptance.
- [FRIENDS_CHAT_PLAN.md](FRIENDS_CHAT_PLAN.md) — целевые social/chat requirements и текущий implementation gap.
- [REMAINING_MEDIA_SUPPORT_PLAN.md](REMAINING_MEDIA_SUPPORT_PLAN.md) — handoff оставшихся media/support циклов.
- [SESSION_REPORT_2026-07-18.md](SESSION_REPORT_2026-07-18.md) — исторический handoff инженерной сессии; текущий статус superseded master plan-ом.

## История

- [CHANGELOG.md](../CHANGELOG.md) — человекочитаемая история изменений.
- [VERSIONS.md](VERSIONS.md) — legacy commit ledger; не источник статуса.
- [archive/README.md](archive/README.md) — архив superseded документов.
