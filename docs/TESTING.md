# Проверки

## JavaScript и контракты

Из корня после `npm ci`:

```bash
npm run typecheck
npm run test:shared
npm run contracts:check
npm run typecheck:web
npm run build:web
npm run typecheck --workspace perum-mobile
npm test --workspace perum-mobile
npm run validate:config --workspace perum-mobile
npm run export:android --workspace perum-mobile
npm run export:ios --workspace perum-mobile
```

`npm run typecheck` уже запускает workspace typechecks. Отдельные команды выше
полезны для воспроизведения конкретного CI job.

## Backend

```bash
(cd perum-core && python -m pytest -q)
(cd perum-tenant && python -m pytest tests/unit -q)
```

Tenant CI также проверяет один Alembic head, SQLite migration smoke и focused
academic suites. Точные команды всегда сверяются с `.github/workflows/ci.yml`.

## CI

`ci.yml` выполняет core/tenant tests, shared/web/mobile checks, production web
build, mobile exports и OpenAPI generation/drift. `release.yml` запускается для
успешного CI commit и не заменяет тестовый workflow.

Инфраструктурные скрипты `deploy/tests/isolation_e2e.sh` и
`deploy/tests/load_test.js` требуют подготовленный стенд и не входят в обычный
локальный unit cycle.
