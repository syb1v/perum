# Архитектура PERUM v2

PERUM — monorepo с control plane и физически изолированными school tenants.
Единица silo — **школа**, не организация.

```text
clients (web/mobile)
        |
        +--> perum-core + control DB
        |      organizations, schools, domains, nodes, releases, org/platform auth
        |
        +--> perum-tenant + school DB
               school users, journal, learning, social, support, gamification
```

## Компоненты

| Компонент | Граница ответственности |
|---|---|
| `perum-core` | Организации, school metadata, domains, node registry, provisioning orchestration, releases, control-plane auth, billing foundation и telemetry |
| `perum-tenant` | Один runtime и одна DB на школу; все внутришкольные данные и роли |
| `perum-web` | Одна Next.js сборка для platform/org и school UI; API выбирается по host/context |
| `perum-mobile` | Core discovery, раздельные Core/tenant accounts, secure sessions, persisted cache/outbox |
| `packages/*` | Generated API contracts, transport, domain helpers и design tokens |

## Размещение

School stack может быть локальным на control-plane Docker host или назначенным
remote node. В обоих случаях Core оркестрирует жизненный цикл, а tenant остаётся
school silo. Remote worker — тот же image `perum-core` с `ROLE=org_agent`; детали
в [INFRASTRUCTURE.md](INFRASTRUCTURE.md) и [WORKER.md](WORKER.md).

Web image отдельный от Tenant. Caddy направляет `/api` и tenant service paths в
school app, а web traffic — в настроенный `WEB_UPSTREAM`. Tenant root возвращает
service JSON и не содержит Next.js bundle.

Generated remote-node stack пока не включает `perum_web`, а default
`WEB_UPSTREAM=perum_web:3000` на такой ноде неразрешим без внешнего web upstream.
Поэтому remote-node school assignment нельзя считать production-ready для web UI,
пока topology явно не предоставляет доступный `WEB_UPSTREAM`; API-only health не
является достаточной проверкой.

## Потоки доверия

- `platform_admin` и `org_admin` аутентифицируются в Core.
- `school_admin`, `director`, `teacher`, `student`, `parent` аутентифицируются в tenant.
- Core не выполняет SQL к school DB. Ограниченный lifecycle/admin RPC защищён
  отдельным internal token и не предоставляет доступ к учебным данным.
- Tenant telemetry использует отдельный token.
- Mobile получает canonical tenant descriptor через Core discovery и затем
  аутентифицируется непосредственно в tenant.
- Mobile request-time traffic lease привязан к account, descriptor revision,
  canonical route и validity window; resume, account switch и rediscovery
  синхронно инвалидируют ранее выданные clients до принятия нового descriptor.
- Core public discovery и scoped operator diagnostics используют единый mobile
  descriptor resolver. Effective social capabilities дополнительно требуют
  platform grant, org enable, fresh matching deployment snapshot и совпадение
  desired/observed rollout generation; revoke поэтому закрывает discovery сразу.
- Core-to-node commands используют Agent API; публичная сеть требует защищённого
  transport boundary, описанного в [HARDENING.md](HARDENING.md).

## Данные и releases

Control DB и каждая school DB имеют независимые Alembic migrations. Tenant image
публикуется как immutable `git-<sha>` artifact; установка в школу opt-in для
`org_admin`. Control-plane images релизятся независимо. См.
[RELEASING.md](RELEASING.md).

Текущий статус функций и roadmap намеренно отсутствуют здесь: источник истины —
[PRODUCT_MASTER_PLAN.md](PRODUCT_MASTER_PLAN.md).
