# Инфраструктура

PERUM поддерживает два размещения school silo: на local control-plane Docker host
и на remote node. Remote nodes расширяют capacity, но не меняют data boundary.

## Control-plane stack

`deploy/docker-compose.core.yml` поднимает Core, control PostgreSQL, Web, shared
Redis, Caddy, Docker socket proxy, Prometheus и Grafana. Production image/settings
override находятся в `deploy/docker-compose.prod.yml` и внешнем env/secret store.
Core обращается к Docker daemon через `docker_proxy`, не через raw socket mount.

## Remote node

Version-controlled generator `perum-core/app/services/node_bootstrap.py` создаёт
bootstrap script и compose для `perum_agent`, node DB, Redis, socket proxy, Caddy
и Watchtower. Platform admin регистрирует node и выдаёт one-time enrollment
artifact; worker enrolls on boot. Node planner назначает школы active/enabled
nodes с учётом organization и capacity metadata.

Generated compose не включает `perum_web`. Перед назначением production school
оператор обязан предоставить доступный `WEB_UPSTREAM` или изменить topology;
иначе API может быть healthy, а web routes будут недоступны.

`deploy/org-node/docker-compose.yml` является legacy reference и не соответствует
полному generated node stack. Не используйте его для production deployment; см.
[deploy/org-node/README.md](../deploy/org-node/README.md).

## Network и observability

- Public traffic открывает только утверждённые HTTP/TLS endpoints.
- Agent port не следует публиковать без network ACL/TLS boundary.
- Core monitor опрашивает worker `whoami`/`health` и сохраняет node metrics.
- Prometheus/Grafana compose defaults должны быть переопределены в production.
- Capacity coefficients в коде являются planner hints, не гарантированным sizing;
  production sizing подтверждается load/usage measurements.

Deployment и incident commands находятся в [RUNBOOK.md](RUNBOOK.md), node flow —
в [NODE_DEPLOYMENT.md](NODE_DEPLOYMENT.md).
