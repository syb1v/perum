# Launch API Authorization and Privacy Review

Статус: **NO-GO**

Focused review охватил Core public discovery, platform/org authorization,
provisioning и node control, а также Tenant identity, academic reads/mutations,
coursework attachments и requester/operator support boundaries.

## Findings

| ID | Severity | Boundary | Status |
|---|---|---|---|
| SEC-001 | P0 | Один общий node agent credential принимался всеми нодами | Исправлено в коде; production rotation pending |
| SEC-002 | P1 | Core передаёт agent credential и tenant secrets к public agent port по HTTP | OPEN |
| SEC-003 | P1 | Subject Teacher мог читать analytics другого/всех предметов класса | Исправлено |
| SEC-004 | P1 | Student/Parent мог скачать attachment unpublished homework по ID | Исправлено |
| SEC-005 | P1 | Former Teacher сохранял coursework mutation authority после revoke assignment | Исправлено |

## Remediation

- Core `0.5.4` выводит уникальный agent credential как HMAC от master secret и
  canonical node hostname. Bootstrap получает только derived credential конкретной
  ноды; `RemoteNodeClient` никогда не отправляет master credential. Controlled
  rebootstrap явно заменяет legacy shared token.
- Tenant `1.1.12` требует exact current class+subject assignment для non-homeroom
  Teacher analytics и для каждой Teacher coursework mutation.
- Attachment download для Student/Parent использует тот же publication predicate,
  что и homework listing.

## Verification

- Focused Core tests: `11 passed`.
- Full Core suite: `255 passed`.
- Focused Tenant authorization regression: `1 passed`.
- Full Tenant unit suite: `329 passed`.
- Regression покрывает distinct per-node credentials, отсутствие master token в
  bootstrap/request, analytics exact-subject denial, draft attachment denial и
  assignment-revocation mutation denial.

## Residual Risk

`SEC-002` остаётся OPEN. Node hostname может быть raw IP, а agent port публикуется
на всех interfaces; `RemoteNodeClient` использует plaintext HTTP. Простая замена
scheme на HTTPS не обеспечивает проверяемую server identity и ломает существующий
IP-based contract. До approved private management network или mTLS/application
envelope provisioning traffic следует считать способным раскрыть durable tenant
secrets сетевому наблюдателю.

## Production Gate

M4 security criterion остаётся незакрытым до выполнения всех условий:

1. Production Core восстановлен и обновлён до `0.5.4` или новее.
2. Каждая active node controlled rebootstrap/rotation прошла новым bootstrap;
   credential одной ноды доказанно отклоняется другой.
3. Agent transport переведён на approved confidential, server-authenticated path;
   plaintext public management port закрыт.
4. Core/Tenant security suites и production read-only authorization smoke зелёные.

## Published Candidates

- CI `31600514380`: success.
- Recovery publication `31601089314`:
  - Core `0.5.4`: `sha256:0601e6f7cd03e8937877e2ea9c708eafb98f7bf73b740ba1e222216a9f6da1d2`;
  - Tenant `1.1.12`: `sha256:0e72f35cc27336a8b1c58f7b4e2a55bbbe645ff8d10fd8ddaee98e33548fefbe`;
  - Tenant release registration succeeded.
- Durable Caddy network fix candidate: Core digest
  `sha256:24e188cdf1fc941f15ada99572b7ab52386be299fba248dabf719618cdc7c1be`,
  release `31603915570`.

Candidates are published, not accepted as production security rollout. Core
deploy rolled back after disk exhaustion; Tenant remains opt-in and was not rolled
out. Per-node credential rotation and confidential transport remain mandatory.
