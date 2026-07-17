# Node worker (`ROLE=org_agent`)

Worker использует image `perum-core`, но при `ROLE=org_agent` не запускает
platform bootstrap/background loops. На старте он выполняет enrollment и
обслуживает `/api/agent`.

## API

Фактические routes определены в `perum-core/app/agent/router.py`:

- `GET /api/agent/whoami`, `GET /api/agent/health`;
- authenticated list/provision/update/suspend/unsuspend/deprovision schools;
- authenticated internal RPC proxy;
- landing provision/deprovision;
- node stack restart и heartbeat.

Не полагайтесь на этот список как на schema: запросы/ответы сверяются с generated
OpenAPI по [API_CONTRACTS.md](API_CONTRACTS.md).

## Responsibilities

- применить school stack spec локальным Docker daemon;
- держать school app/DB/volumes раздельно;
- обновлять tenant app, сохраняя persistent data и откатывая image при failure;
- управлять local Caddy routes;
- передавать runtime/deployment snapshot;
- проксировать только allowlisted internal school-admin operations.

## Trust boundary

Mutating Agent API требует `AGENT_TOKEN`; enrollment token одноразовый. Generated
node stack использует socket proxy для worker, но Watchtower имеет raw socket для
самообновления, поэтому node host остаётся privileged boundary. Agent transport
через недоверенную сеть должен быть ограничен firewall/VPN/TLS; bearer token сам
по себе не шифрует traffic.

Операционные шаги: [NODE_DEPLOYMENT.md](NODE_DEPLOYMENT.md) и
[RUNBOOK.md](RUNBOOK.md).
