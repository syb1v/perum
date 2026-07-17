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

Stage F lifecycle evidence находится в `perum-mobile/src/auth/trafficCore.test.ts`
и `api.test.ts`; release contract воспроизводится через
`perum-core/tests/test_release_manifest.py`. Named CI gate обязателен до Tenant
image/release publication.

`npm run contracts:generate` автоматически использует service `.venv` локально,
если он существует; в clean CI использует `python` из `PATH`. Явные
`TENANT_PYTHON`/`CORE_PYTHON` поддерживают absolute или repository-relative paths.

Инфраструктурные скрипты `deploy/tests/isolation_e2e.sh` и
`deploy/tests/load_test.js` требуют подготовленный стенд и не входят в обычный
локальный unit cycle.
