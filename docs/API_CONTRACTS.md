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

Просмотрите generated diff вместе с backend изменением. CI повторно генерирует
контракты, требует clean diff и запускает curated contract check.

`@perum/api-client` предоставляет platform-neutral transport. Web и mobile могут
добавлять environment adapters, но не должны вручную расходиться с generated
request/response types. Anonymous mobile discovery и tenant descriptor имеют
дополнительный structural parity gate, описанный в
[DYNAMIC_MOBILE_DESCRIPTOR_PLAN.md](DYNAMIC_MOBILE_DESCRIPTOR_PLAN.md).
