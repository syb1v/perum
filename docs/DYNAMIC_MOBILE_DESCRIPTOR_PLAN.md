# План динамического mobile descriptor

**Статус:** Stages A-E выполнены; Stage F pending. Live проценты и текущий
roadmap ведутся только в [PRODUCT_MASTER_PLAN.md](PRODUCT_MASTER_PLAN.md).

**Дата:** 2026-07-17

**Источник:** [PRODUCT_MASTER_PLAN.md](PRODUCT_MASTER_PLAN.md), WS7 и этап 1

## 1. Цель

Сделать public tenant discovery достоверным для школ на разных релизах: Core
должен возвращать versioned compatibility/capabilities конкретного установленного
tenant release, а Mobile должен проверить и применить descriptor до первого
authenticated tenant-запроса.

Готовый контур обязан:

- не выполнять live Core -> Tenant запрос во время anonymous discovery;
- разрешать descriptor по `School.release_tag` локально в Core;
- fail-closed обрабатывать неизвестный релиз, schema version и capability;
- не смешивать возможности сборки, состояние deployment, school policy,
  entitlement и RBAC;
- сохранять доступ к ранее проверенному tenant endpoint только в ограниченный
  grace period при network error, `429` или `5xx` от Core;
- выдавать одинаковый versioned contract из Core discovery и tenant mobile API.

## 2. Принятые решения

### 2.1. Источник истины

Основной источник build-time compatibility/capabilities — валидируемый release
manifest, который CI публикует в Core вместе с `Release`. Школа получает manifest
через уже существующую связь `School.release_tag` с `Release.image`.

Это решение выбрано вместо live Core -> Tenant query:

- discovery выполняет локальный DB lookup без сетевого fan-out;
- недоступность tenant не ломает discovery;
- anonymous endpoint не получает SSRF-подобную зависимость от tenant routing;
- descriptor revision детерминированно меняется при смене release manifest;
- Core может проверить manifest до публикации релиза.

Доверие строится на существующем authenticated CI publish-контуре и строгой
schema validation. Отдельная криптографическая подпись manifest не входит в этот
slice: она не устраняет компрометацию CI credential и требует отдельного key
rotation ADR. Если release artifacts начнут поступать вне доверенного CI, подпись
становится обязательным follow-up.

### 2.2. Категории доступности

Public descriptor сообщает только безопасные сведения:

- `compatibility` — API-совместимость конкретного release;
- `build_capabilities` — функции, физически присутствующие в release;
- `deployment_capabilities` — безопасный snapshot готовности инфраструктуры;
- итоговые `capabilities` — пересечение build и свежего deployment snapshot.

School policy, billing entitlement и role permission не публикуются anonymous
клиенту. Они проверяются tenant после authentication. Значение capability не
заменяет серверную авторизацию.

### 2.3. Grace period

После expiry Mobile сначала обязан выполнить rediscovery. Last-known-good
descriptor разрешён не более 24 часов после `descriptor_expires_at` и только при
network error, `429` или `5xx` от Core. `4xx`, identity mismatch, неизвестная
schema, malformed descriptor и известная несовместимость fallback запрещают.

Значение 24 часа задаётся mobile-константой в первой версии контракта. Его нельзя
удалённо увеличивать через просроченный descriptor. Использование fallback
фиксируется локальной telemetry event; после grace period session переходит в
явное blocked состояние без удаления account и pending outbox.

## 3. Контракт v1

Общая схема descriptor-а:

```json
{
  "schema_version": 1,
  "compatibility": {
    "mobile_api_version": 1,
    "minimum_mobile_api_version": 1,
    "minimum_app_version": "0.0.0"
  },
  "capabilities": {
    "refresh_sessions": true,
    "session_management": true,
    "push_registration": true,
    "push_delivery": false,
    "social_friends": true,
    "social_messages": true,
    "social_realtime": true,
    "social_attachments": false,
    "support_requester": true,
    "support_attachments": false,
    "offline_preferences": true,
    "offline_homework_state": true,
    "offline_social_messages": true,
    "offline_support_messages": true,
    "offline_read_cursors": false,
    "offline_support_ticket_creation": false
  }
}
```

Правила v1:

- поля schema и compatibility обязательны;
- capability отсутствует или неизвестна клиенту — функция недоступна;
- неизвестный `schema_version` блокирует bootstrap, а не интерпретируется как v1;
- `minimum_app_version` сравнивается как SemVer только после добавления общей
  проверенной функции; невалидная версия отклоняет manifest при публикации;
- capability означает наличие клиент-серверного контура, но не разрешение
  конкретному пользователю;
- attachments остаются `false`, пока production scanner недоступен;
- push delivery остаётся `false`, пока нет реального delivery adapter;
- descriptor revision включает canonical routing, TTL-independent contract и
  effective capabilities, но не timestamp ответа.

## 4. Модель данных и потоки

### 4.1. Release manifest

В `Release` добавить JSON-поля:

- `mobile_descriptor_schema_version`;
- `mobile_compatibility`;
- `mobile_build_capabilities`.

`ReleaseCreate` принимает manifest как обязательное поле для новых CI-релизов.
Legacy/manual release без manifest разрешён в БД, но public discovery для школы
на таком релизе возвращает conservative v1 descriptor со всеми optional
capabilities `false`; compatibility берётся только из явно заданного legacy
baseline, а не угадывается по tag.

### 4.2. Deployment snapshot

Agent heartbeat расширяется безопасным versioned snapshot:

- установленный image/release identity;
- scanner readiness;
- realtime readiness;
- push registration readiness;
- push delivery readiness;
- timestamp наблюдения.

Core принимает snapshot только от уже аутентифицированного school/node agent,
проверяет соответствие school и установленного release и хранит отдельно от
release manifest. Snapshot старше настраиваемого окна считается unavailable.
Build capability никогда не может быть повышена snapshot-ом: effective value
равно `build && deployment`, если функция зависит от deployment.

### 4.3. Discovery

Core разрешает active school по UUID/host, находит `Release` по
`School.release_tag == Release.image`, формирует effective contract и вычисляет
revision. Alias и UUID lookup обязаны возвращать одинаковый contract и revision.

## 5. Этапы реализации

### Этап A. Shared schema и release publication (выполнен)

Файлы:

- `perum-core/app/models.py`;
- `perum-core/app/routers/releases.py`;
- `perum-core/app/routers/releases_ci.py`;
- `perum-core/app/migrations/versions/`;
- `packages/api-schema/openapi/core.json`;
- `packages/api-schema/generated/core.ts`;
- release workflow payload в `.github/workflows/release.yml` и связанных scripts.

Работы:

1. Добавить Pydantic schema v1 и строгую валидацию manifest.
2. Добавить nullable JSON-поля и Alembic migration.
3. Публиковать manifest из version-controlled файла tenant release.
4. Запретить CI publish нового release без manifest.
5. Сохранить explicit conservative baseline для legacy release.
6. Добавить manifest в release API response без секретных runtime settings.

Acceptance tests:

- valid manifest публикуется и читается без преобразования типов;
- malformed schema, range, SemVer и unknown key отклоняются;
- повторная публикация не может незаметно изменить manifest существующей версии;
- legacy release обрабатывается fail-closed.

### Этап B. Dynamic Core discovery (выполнен)

Файлы:

- `perum-core/app/schemas/public.py`;
- `perum-core/app/routers/public.py`;
- отдельный service resolver при необходимости повторного использования;
- `perum-core/tests/test_tenant_discovery.py`.

Работы:

1. Заменить константы compatibility/capabilities release resolver-ом.
2. Добавить `schema_version` и curated capabilities в response.
3. Включить effective contract в descriptor revision.
4. Не раскрывать school policy, entitlement и role data.
5. Добавить structured telemetry для unknown release, missing manifest и
   unavailable deployment descriptor; не включать tenant/user secrets.

Acceptance tests:

- школы на разных images получают разные contracts;
- смена release меняет revision;
- alias, canonical host и UUID дают одинаковый результат;
- unknown release не обещает optional capability;
- inactive/suspended school и rate limit сохраняют прежнюю семантику.

### Этап C. Deployment snapshot (выполнен)

Файлы:

- `perum-core/app/agent/schemas.py`;
- `perum-core/app/agent/service.py`;
- `perum-core/app/models.py` или отдельная deployment-state model;
- `perum-core/app/migrations/versions/`;
- agent heartbeat producer;
- agent/core tests.

Работы:

1. Добавить authenticated versioned snapshot.
2. Проверять school/release identity и монотонность наблюдения.
3. Хранить `observed_at` и применять freshness window.
4. Вычислять effective capability как безопасное пересечение.
5. При stale/missing snapshot отключать только deployment-dependent функции.

Acceptance tests:

- snapshot другой школы или release отклоняется;
- stale snapshot не включает capability;
- snapshot не повышает отсутствующую build capability;
- scanner unavailable гарантированно оставляет attachments выключенными.

### Этап D. Tenant contract parity (выполнен)

Файлы:

- `perum-tenant/app/modules/auth/router.py`;
- schema/config модуля mobile compatibility;
- `packages/api-schema/openapi/tenant.json`;
- `packages/api-schema/generated/tenant.ts`;
- tenant contract tests.

Работы:

1. Заменить ad hoc dict двух mobile endpoints на общие Pydantic schemas.
2. Публиковать тот же `schema_version`, compatibility и capability names.
3. Сверять runtime readiness с данными heartbeat producer.
4. На compatibility window сохранить старые endpoints либо объединить их через
   один внутренний resolver без расхождения ответов.

Acceptance tests:

- Core и Tenant schema contract не расходятся;
- production `UnavailableScanner` означает attachments `false`;
- отсутствующий push provider означает push delivery `false`;
- неизвестная runtime integration не включается по умолчанию.

### Этап E. Mobile persistence, gating и grace period (выполнен)

Файлы:

- `perum-mobile/src/auth/types.ts`;
- `perum-mobile/src/auth/descriptorCore.ts`;
- `perum-mobile/src/auth/AuthProvider.tsx`;
- новый минимальный capability selector/provider;
- `perum-mobile/src/auth/descriptorCore.test.ts`;
- feature providers и routes, которые запускают background requests.

Работы:

1. Сохранять schema version, compatibility, capabilities и время последней
   успешной проверки атомарно с routing metadata.
2. Считать legacy account несвежим без полного v1 descriptor.
3. Реализовать 24-часовой grace period и отдельный blocked reason после него.
4. Проверять compatibility cached descriptor до offline fallback.
5. Gate background providers до первого tenant request.
6. Не удалять pending outbox при временном отключении capability; переводить
   отправку в blocked/pending состояние.
7. Различать UX: app outdated, tenant release outdated, feature unavailable,
   Core temporarily unavailable и grace expired.

Acceptance tests:

- cold start и account switch не отправляют tenant request до descriptor gate;
- разные accounts не разделяют capabilities;
- rediscovery атомарно меняет endpoint, revision и capabilities;
- fallback работает до границы grace и блокируется после неё;
- `4xx`, identity mismatch и incompatibility никогда не используют fallback;
- capability `false` не запускает соответствующий background provider;
- pending mutation сохраняется при временном capability downgrade.

### Этап F. Lifecycle и release gates

Stage E реализует runtime-механику клиента: persistence descriptor-а, capability
gating, grace period и fail-closed поведение отдельных providers/routes/outboxes.
Stage F не дублирует эту реализацию: он проверяет полный lifecycle приложения и
релиза на границах cold start/resume/account switch/upgrade/downgrade и делает
эти сценарии release gate. Поэтому выполненный Stage E не закрывает Stage F.

Исполнимая acceptance matrix:

| Сценарий | Начальное состояние | Ожидаемый результат | Evidence | Статус |
|---|---|---|---|---|
| Cold start online | fresh complete v1 descriptor | cached validation до первого tenant request, без Core call | `trafficCore.test.ts` | automated local pass |
| Cold start rediscovery | expired descriptor, Core available | atomic route/revision/capabilities update до tenant request | `trafficCore.test.ts` | automated local pass |
| Cold start grace | expired descriptor, network/429/5xx, grace active | compatible LKG разрешён, `core_unavailable`, account/outbox сохранены | `trafficCore.test.ts` | automated local pass |
| Cold start blocked | grace expired или malformed/incompatible/identity mismatch | `apiClient` закрыт, tenant requests отсутствуют, account/outbox сохранены | `descriptorCore.test.ts`, `trafficCore.test.ts` | automated local pass |
| Resume before/after TTL | foreground transition | до TTL без discovery; после TTL providers закрыты до resolver result | `trafficCore.test.ts` | automated local pass |
| Account switch | accounts на разных releases | нет route/capability/cache/outbox leakage | `trafficCore.test.ts` | automated local pass |
| School upgrade | новый manifest/revision | capabilities запускаются только после atomic acceptance | `trafficCore.test.ts`, Core discovery pytest | automated local pass |
| School downgrade | capability удалена | provider/outbox send остановлен, mutation identity сохранена | `trafficCore.test.ts`, Core discovery pytest | automated local pass |
| Stale deployment snapshot | snapshot старше freshness | только deployment-dependent capabilities false | `test_stale_snapshot_disables_only_runtime_dependent_capabilities` | automated local pass |
| Refresh rotation failure | descriptor accepted, refresh fails | account не мутируется частично, другой account не затронут | `auth/api.test.ts`, shared client test | automated local pass |
| Release publication | новый Tenant release | valid manifest и Core/Tenant parity обязательны | `Tenant release descriptor contract gate`; first named job passed in CI run `29597933464`, full rerun pending generator fix | pending successful full CI run |
| Pilot rollout | одна opt-in school | проверены unknown-release, grace и incompatible-client telemetry | operator record | pending |

Строка закрывается только ссылкой на automated test/CI run или recorded manual
evidence. После закрытия всех строк обновляются DoD ниже и live percentages в
`PRODUCT_MASTER_PLAN.md`.

Проверки:

- Core pytest;
- Tenant unit pytest;
- Mobile unit tests и TypeScript typecheck;
- curated OpenAPI drift check;
- cold start online/offline;
- app resume после TTL;
- account switch между школами на разных releases;
- school upgrade/downgrade;
- stale deployment snapshot;
- refresh rotation failure после успешного descriptor gate.

Новый release нельзя считать готовым, пока CI не подтвердил наличие valid
manifest и contract parity. Rollout начинается с одной opt-in школы; метрики
unknown release, grace fallback и incompatible client проверяются до расширения.

## 6. Вне scope

- school policy, entitlement и RBAC в anonymous descriptor;
- live Core -> Tenant discovery;
- автоматическое включение attachments до production scanner;
- реализация offline read cursors и support ticket creation;
- криптографическая подпись release artifacts;
- remote kill switch, способный ослабить compatibility проверки клиента.

## 7. Definition of Done

- [x] Новый release невозможно опубликовать через CI без valid manifest v1.
- [x] Core разрешает contract по фактическому `School.release_tag` без live query.
- [x] Descriptor revision учитывает effective contract.
- [x] Attachments и push delivery не включаются без runtime readiness.
- [x] Core и Tenant проходят schema parity tests.
- [x] Mobile сохраняет и применяет capabilities до authenticated request.
- [x] Неизвестные schema/capabilities обрабатываются fail-closed.
- [x] Last-known-good fallback ограничен 24 часами и наблюдаем в UX gate state.
- [x] Identity mismatch и compatibility failure не допускают fallback.
- [ ] Проверены cold start, resume, account switch, upgrade и downgrade.
- [x] Обновлены OpenAPI, generated clients, CHANGELOG и VERSIONS.

## 8. Следующий slice

После этого плана: durable SQLite outbox для social/support read cursors,
offline support ticket creation и единая multi-device conflict matrix. Friends
attachments остаются заблокированы до выбора production scanner.
