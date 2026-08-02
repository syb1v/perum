# Документация PERUM

Этот файл — индекс активной документации. Единственный источник текущего
продуктового статуса, процентов и roadmap — [PRODUCT_MASTER_PLAN.md](PRODUCT_MASTER_PLAN.md).
Остальные документы описывают устройство, требования или процедуры и не должны
вести собственный live roadmap.

## Начало работы

- [PRODUCT_MASTER_PLAN.md](PRODUCT_MASTER_PLAN.md) — Web-first Launch V1 scope, progress и критический roadmap.
- [POST_LAUNCH_BACKLOG.md](POST_LAUNCH_BACKLOG.md) — сохранённый scope, который не блокирует первый запуск.
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

## Post-launch specifications

- [DYNAMIC_MOBILE_DESCRIPTOR_PLAN.md](DYNAMIC_MOBILE_DESCRIPTOR_PLAN.md) — отложенные Mobile descriptor и Stage F requirements.
- [FRIENDS_CHAT_PLAN.md](FRIENDS_CHAT_PLAN.md) — отложенное расширение social/chat.
- [REMAINING_MEDIA_SUPPORT_PLAN.md](REMAINING_MEDIA_SUPPORT_PLAN.md) — отложенные media/attachments и support integrations.
- [DEFERRED_STAGE_REQUIREMENTS.md](DEFERRED_STAGE_REQUIREMENTS.md) — prerequisites отложенных Mobile/offline этапов.
- [SESSION_REPORT_2026-07-18.md](SESSION_REPORT_2026-07-18.md) — исторический handoff инженерной сессии; текущий статус superseded master plan-ом.

## История

- [CHANGELOG.md](../CHANGELOG.md) — человекочитаемая история изменений.
- [VERSIONS.md](VERSIONS.md) — legacy commit ledger; не источник статуса.
- [archive/README.md](archive/README.md) — архив superseded документов.
