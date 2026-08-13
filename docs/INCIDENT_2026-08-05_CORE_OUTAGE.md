# P0: недоступен production Core

Статус: **OPEN**
Severity: **P0**
Начало по внешнему monitor evidence: **2026-08-04 23:27 UTC**

## Impact

- Production Core `https://пэрум.рф` не устанавливает HTTPS connection.
- `/health` и public tenant discovery недоступны, поэтому control-plane и новый
  school discovery не работают.
- `https://school-1.grsn-panel.ru/health` продолжает отвечать `200`; известная
  school data plane доступна через Cloudflare. Полный impact на пользовательские
  journeys ещё не принят как resolved.
- Application-level recovery через SSH невозможен: management connection к Core
  origin timeout. Никакие контейнеры или volumes не перезапускались и не удалялись.

## Evidence

| UTC | Evidence | Result |
|---|---|---|
| 2026-08-04 21:39 | Synthetic monitor `30953233711` | GO |
| 2026-08-04 23:27 | Synthetic monitor `30960068779` | NO-GO: health + discovery |
| 2026-08-05 03:37 | Synthetic monitor `30972786789` | NO-GO: health + discovery |
| 2026-08-05 06:44 | Synthetic monitor `30982390118` | NO-GO: health + discovery |
| 2026-08-05 09:24 | Manual monitor `30993103035` на `main` | NO-GO: оба public checks timeout |
| 2026-08-05 09:17 | Independent external probe | Core HTTPS и SSH timeout; school health `200` |
| 2026-08-12 13:25 | Security release `31601089314` | Images published; deploy/rollback failed |
| 2026-08-12 13:31 | Diagnostics `31601851103` | Root filesystem `100%`; PostgreSQL rejecting connections |
| 2026-08-12 13:36 | Disk recovery `31602138132` | Disk `100% → 38%`; DB/Core healthy |
| 2026-08-12 13:49 | Synthetic monitor `31603591225` | GO |
| 2026-08-12 13:54 | Diagnostics `31603823994` | Core/discovery/school `200`; Caddy network drift proven |
| 2026-08-12 13:56 | School route recovery `31604011231` | Origin healthy; route reconciled |

Artifacts monitor runs содержат только boolean checks и decision, без credentials
или PII.

## Diagnosis

Первичный outage совпал с исчерпанием root filesystem Core host. Следующий deploy
заполнил оставшееся место при pull image: PostgreSQL начал rejecting connections,
Core не стартовал, rollback также не прошёл health gate. Bounded cleanup удалил
только unused Docker images/build cache, не volumes, освободил диск до `38%` и
восстановил DB/Core. Recreate Caddy на organization node оставил его только в
`perum_internal`, тогда как tenant был только в `school_sch2_net`; route указывал
на правильный IP, но backend был недостижим. Подключение Caddy к tenant network и
штатный idempotent route resync восстановили school origin.

## Required Recovery

1. Service owner открывает provider console/out-of-band access и проверяет power,
   network ACL, routing, disk pressure и host status согласно `RUNBOOK.md`.
2. До получения host evidence не выполнять DNS cutover, destructive Docker
   actions или массовый restart school stacks.
3. После восстановления проверить Core `/health`, public discovery и critical
   operator login, затем дождаться successful Synthetic monitor.
4. Зафиксировать recovery time, root cause, corrective action и resolved receipt.

## Resolution Gate

Incident остаётся OPEN, пока одновременно не выполнены условия:

- Core HTTPS `/health` возвращает exact `200 {"status":"ok"}`;
- tenant discovery возвращает валидный descriptor approved school;
- manual и следующий scheduled Synthetic monitor завершаются success;
- service owner подтвердил host/provider root cause и отсутствие data loss.

Первые три технических условия выполнены. Owner confirmation и preventive disk
capacity/retention decision остаются pending, поэтому статус не RESOLVED.

2026-08-12 user/browser recheck выявил отдельный региональный edge defect:
обычный Chromium не загружает `grsn-panel.ru` и `school-1.grsn-panel.ru`, тогда как
тот же Chromium с direct IPv4 origin получает `200`. Cloudflare публикует generated
AAAA, а IPv6 requests с affected contour timeout. Попытка изменить zone setting
через production Core fail-closed: Cloudflare integration в текущем rollback runtime
не включена. Требуется действие владельца Cloudflare zone; incident не закрыт.
Synthetic monitor теперь fail-closed отклоняет generated AAAA для landing/school,
пока IPv6 Compatibility не отключена или отдельный IPv6 browser contour не доказан.

Повторная пользовательская проверка выявила ещё один P0 на authenticated school
journey: `GET /dashboard` возвращал `500`, хотя unauthenticated probe корректно
получал `307 /login?auth=required`. Root cause находится в clean-route Web rewrite:
при различающихся reverse-proxy authorities внутренний upstream `Host` имел
приоритет над canonical `X-Forwarded-Host`. Web `2.3.8` меняет приоритет и E2E
proxy теперь воспроизводит production topology; production rollout и
authenticated browser receipt остаются обязательными до закрытия incident.

Release `31645857619` успешно опубликовал Web `2.3.8`, но штатный control-plane
deploy обновляет только Core host. Существующий organization node сохранил прежний
общий `perum_web`, поэтому school продолжила возвращать authenticated `500`.
Добавлен отдельный Web-only node rollout с immutable digest, protected-container
identity gate, route resync и автоматическим rollback; production receipt pending.

Web-only recovery `31652235744` успешно установил immutable Web `2.3.8`
(`sha256:d7ff5cbcf0e3a107ff22925ebb6a04cc8aea55bdbc34be130b75f9b05249d3de`)
на organization node. Workflow подтвердил healthy Web, неизменные Tenant/DB/Caddy/Agent
container identities и reconciled route. Edge и direct origin возвращают
`/login=200`, unauthenticated `/dashboard=307` и `/health=200`; authenticated
browser receipt владельца остаётся последним gate для этого application defect.

2026-08-13 authenticated production probe с JWT-shaped routing cookie доказал,
что direct `/student` возвращает `200`, а clean `/dashboard` не возвращает ни
одного байта: Web `2.3.8` превращал rewrite в recursive request через public Caddy.
Web `2.3.9` удаляет authority-dependent rewrites: login и clean aliases выполняют
redirect на реальные role routes, а E2E требует завершённый dashboard document.
Production rollout и owner browser receipt pending.
