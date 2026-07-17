# ПЭРУМ

ПЭРУМ — multi-tenant школьная SaaS-платформа: электронный журнал, аналитика,
геймификация, социальные функции и клиенты web/mobile. Архитектурный инвариант
v2: **silo-per-SCHOOL**. Каждая школа работает в отдельном tenant-приложении со
своей базой данных; Core хранит control-plane метаданные.

## Монорепозиторий

| Путь | Назначение |
|---|---|
| `perum-core/` | FastAPI control plane и режим node worker `ROLE=org_agent` |
| `perum-tenant/` | FastAPI school tenant: учебный контур и школьные функции |
| `perum-web/` | Next.js 16 / React 19 web-клиент |
| `perum-mobile/` | Expo SDK 57 / React Native mobile-клиент |
| `packages/` | OpenAPI schema/client, domain logic и design tokens |
| `deploy/` | Compose, Caddy, observability и node bootstrap assets |
| `docs/` | Активная документация и исторический архив |

## Начало работы

1. Откройте [индекс документации](docs/README.md).
2. Сверьте текущий статус и roadmap только с [PRODUCT_MASTER_PLAN.md](docs/PRODUCT_MASTER_PLAN.md).
3. Прочитайте [архитектуру](docs/ARCHITECTURE.md), [изоляцию](docs/TENANT_ISOLATION.md) и [роли](docs/ROLES.md).
4. Для запуска используйте [LOCAL_DEVELOPMENT.md](docs/LOCAL_DEVELOPMENT.md), для проверок — [TESTING.md](docs/TESTING.md).

## Основные команды

```bash
npm ci
npm run typecheck
npm run test:shared
npm run contracts:check
npm run typecheck:web
npm run build:web

(cd perum-core && python -m pytest -q)
(cd perum-tenant && python -m pytest tests/unit -q)
```

Точные CI gates описаны в [TESTING.md](docs/TESTING.md), release-процесс — в
[RELEASING.md](docs/RELEASING.md), эксплуатационные действия — в
[RUNBOOK.md](docs/RUNBOOK.md). Секреты и production coordinates в документации и
репозитории не хранятся.
