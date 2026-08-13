# Домены и discovery

Core хранит организации, школы и активные domain aliases. У школы есть canonical
primary host; alias может разрешаться в тот же stable public school UUID.

## Web routing

Caddy маршрутизирует control-plane host к Core/Web, а school hosts к назначенному
school stack: локально либо через remote node. Core на старте best-effort
восстанавливает маршруты active/suspended schools. DNS automation доступна при
настроенном provider token; без неё DNS остаётся операционной задачей.

Platform/Core DNS и organization DNS имеют разные policies. Platform/Core edge
может быть Cloudflare `Proxied`. Для каждой organization zone Core управляет apex
landing и school hosts как exact IPv4 `A` records с `DNS only`: трафик идёт прямо
на organization node Caddy, который обслуживает TLS и разделяет Web/Tenant paths.
Provisioning выполняет immediate reconciliation, а periodic sweep исправляет IP и
proxy drift. Cloudflare Workers в этом routing contour не используются.

Не публикуйте здесь реальные domains/IP. Production records берутся из approved
DNS console и operator runbook.

## Mobile discovery

Core предоставляет `GET` и `POST /api/public/tenant-discovery`. Поддерживаемые
selectors определяются API contract: host, stable school identity, invite/code или
organization-domain + school-code flow. Response возвращает canonical API/web
URLs, stable IDs, TTL/revision и versioned compatibility/capabilities.

Клиент не конструирует tenant URL из slug. После TTL он выполняет rediscovery;
fallback ограничен descriptor policy. Anonymous discovery rate-limited и не
публикует полный каталог школ организации.

## Безопасность изменений

- Нормализуйте host и используйте только active domain records.
- Смена primary host не должна менять public school identity.
- Не помещайте credentials/tokens в URL, DNS record или deep link.
- До удаления старого alias проверьте mobile rediscovery и active sessions.
- TLS и DNS cutover проверяются до переключения production traffic.
