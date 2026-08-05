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

Artifacts monitor runs содержат только boolean checks и decision, без credentials
или PII.

## Diagnosis

DNS Core разрешается в ожидаемый public origin, но TCP connection не
устанавливается ни с GitHub Actions, ни с independent operator contour. Поскольку
одновременно недоступны HTTPS и SSH, а school edge продолжает отвечать, наиболее
вероятен host/provider/network outage Core origin, а не regression одного FastAPI
route или monitor timeout policy.

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
