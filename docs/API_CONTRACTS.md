# API-контракты

Core и Tenant публикуют разные OpenAPI surfaces. Version-controlled snapshots и
generated TypeScript находятся в `packages/api-schema/`:

- `openapi/core.json`;
- `openapi/tenant.json`;
- `generated/core.ts`;
- `generated/tenant.ts`;
- `contracts.json` — curated operation set.

## Обновление

После изменения FastAPI route/schema из корня:

```bash
npm run contracts:generate
npm run contracts:check
```

Generator выбирает `perum-tenant/.venv/bin/python` и
`perum-core/.venv/bin/python` локально при их наличии; clean CI использует
установленный `python` из `PATH`. Overrides `TENANT_PYTHON` и `CORE_PYTHON`
разрешаются как absolute или repository-relative executable paths.

Просмотрите generated diff вместе с backend изменением. CI повторно генерирует
контракты, требует clean diff и запускает curated contract check.

`@perum/api-client` предоставляет platform-neutral transport. Web и mobile могут
добавлять environment adapters, но не должны вручную расходиться с generated
request/response types. Anonymous mobile discovery и tenant descriptor имеют
дополнительный structural parity gate, описанный в
[DYNAMIC_MOBILE_DESCRIPTOR_PLAN.md](DYNAMIC_MOBILE_DESCRIPTOR_PLAN.md).

Checked-in `perum-tenant/mobile-descriptor.json` валидируется authoritative Core
schema, а nested Core/Tenant OpenAPI shapes сравниваются в
`perum-core/tests/test_release_manifest.py`; этот test запускается отдельным CI и
release gate до публикации Tenant image.
