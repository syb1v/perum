# Развёртывание remote node

Production node разворачивается только bootstrap script, сгенерированным Core из
`perum-core/app/services/node_bootstrap.py`. Статичный
`deploy/org-node/docker-compose.yml` для этого не использовать.

## Procedure

1. Подготовьте Linux host с Docker Engine/Compose, persistent disk, outbound
   registry/Core access и утверждёнными firewall rules.
2. Platform admin создаёт node через Core UI/API и привязывает её к организации
   либо pool согласно operator policy.
3. Получите свежий one-time bootstrap script через Core. Не сохраняйте script в
   VCS или ticket: он содержит enrollment/agent credentials.
4. Проверьте script и target hostname, затем запустите его с approved privileged
   access на target host.
5. Убедитесь, что `perum_agent`, node DB, Redis, socket proxy, Caddy и Watchtower
   запущены, а Core показывает node active и свежие metrics.
6. Настройте доступный `WEB_UPSTREAM`: generated node compose не содержит
   `perum_web`, а default hostname без внешней topology не разрешается.
7. До назначения production school выполните тестовое provision/update/rollback,
   backup, API и browser routing checks. API-only health недостаточен.

## Security gates

- Agent endpoint доступен только Core по network policy; при crossing public
  network нужен TLS/VPN boundary.
- `.env`, bootstrap script и registry credentials хранятся вне repository.
- Raw Docker socket Watchtower делает node privileged; ограничьте host admins и
  регулярно обновляйте Docker/containers.
- Открывайте 80/443 только если node терминирует school traffic; точная topology
  сверяется с [DOMAINS.md](DOMAINS.md).

Диагностика и rollback: [RUNBOOK.md](RUNBOOK.md).
