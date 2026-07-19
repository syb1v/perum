# PERUM: live product status и master plan

> Этот файл — единственный источник текущего продуктового статуса, процентов,
> handoff и roadmap. Архитектурные и операционные документы не должны дублировать
> эти оценки. Последнее обновление live-блока: **2026-07-19**.

<!-- LIVE_PROGRESS: edit this block after every completed engineering cycle -->
## Live progress

| Срез | Значение | Методика |
|---|---:|---|
| Dynamic mobile descriptor | **10/11 = 90.9%** | 11 проверяемых пунктов Definition of Done; закрыты 10, lifecycle matrix Stage F не закрыта |
| Descriptor stages | **5/6 = 83.3%** | Stages A-E завершены; Stage F pending |
| Stage F lifecycle matrix | **11/12 = 91.7%** | Automated rows и named CI run `29598407038` прошли; privacy-safe diagnostics/ledger/collector foundation готов, deliberate rollback и operator Mobile export evidence pending |
| Общая готовность продукта | **28-33%, midpoint 30%** | Консервативная экспертная переоценка полного scope после durable support/social offline slices, Native Friends и controlled rollout foundation; billing, policy, full role parity, scanner/push integrations и production evidence сохраняют большую часть remaining scope |
| Исторический rewrite | **99% в прежнем scope** | Только завершённость старого rewrite/foundation scope из legacy ledger; не означает готовность текущего полного продукта |

**Текущий этап:** завершение native school support admin inbox и production-пилот утверждённого node-local ClamAV
foundation перед включением social/support attachments. Реализованы один shared
`clamd` на school-hosting node, отдельные per-school relay, `INSTREAM`, durable
lease/retry queue, freshness/readiness и privacy-safe backlog telemetry. Реальный
EICAR, Docker network-isolation и PostgreSQL migration ещё не подтверждены,
поэтому capability flags остаются `false`. Native Friends UI и двухступенчатый
controlled rollout foundation завершены. Native `school_admin`/`director` inbox
получил отдельный release capability, cached list/thread, unread summary,
idempotent online reply/read и conflict-safe metadata/assignment без attachments
и push. One-school pilot Stage F и multi-device Homework
conflict QA явно отложены; их prerequisites вынесены в
[DEFERRED_STAGE_REQUIREMENTS.md](DEFERRED_STAGE_REQUIREMENTS.md), незакрытые шкалы
и remaining scope не изменены.

**Следующий roadmap:** support delivery observability foundation завершён для
реально persisted states; terminal failure policy и exact Core delivery receipts
отложены до отдельного transport design. Durable admin mutations вводить только
при утверждении offline-send scope. Параллельно завершить review и production-like scanner pilot по
[SCANNER_OPERATIONS.md](SCANNER_OPERATIONS.md): собрать digest-pinned images,
проверить PostgreSQL migration, EICAR, network isolation, outage/recovery,
signature updates и node capacity. Только после evidence отдельно проектировать
attachment UI и включение capabilities. Stage F
возобновляется после предоставления
opt-in школы и operator access, Homework conflict QA — после выделения PostgreSQL
concurrency environment и mobile preview QA window. После этого приоритеты
продолжаются по workstream table ниже: Friends/media, учебный hardening, support
escalation, chats/moderation, billing, role parity и production rollout.

**Handoff readiness:** код Stages A-E, automated Stage F gates, durable
support/social read cursors, offline support ticket creation, Friends hardening,
Native Friends UI и двухступенчатый controlled rollout находится в `main`; CI run
[29598407038](https://github.com/syb1v/perum/actions/runs/29598407038) зелёный для
Stage F automation, а последние social/support slices прошли Core/Tenant full
pytest, mobile/shared tests, contract gates, typecheck и web production build.
Pilot checklist и обязательные поля operator record описаны в
[DYNAMIC_MOBILE_DESCRIPTOR_PLAN.md](DYNAMIC_MOBILE_DESCRIPTOR_PLAN.md). Нельзя
закрывать Stage F без operator evidence или Homework hardening без concurrency и
restart/conflict evidence.

**Handoff остатка:** stop gates и порядок media scanner/native support admin
зафиксированы в [REMAINING_MEDIA_SUPPORT_PLAN.md](REMAINING_MEDIA_SUPPORT_PLAN.md),
итоги последней сессии — в
[SESSION_REPORT_2026-07-18.md](SESSION_REPORT_2026-07-18.md).

**Следующие независимые циклы:**

1. Durable social/chat read cursor: завершён, включая server idempotency,
   account-scoped SQLite, retry/recovery, capability gating и contract tests.
2. Friends hardening: завершён, включая privacy-safe audit/telemetry,
   fail-closed feature flag, pagination/isolation tests и 30-дневное read-only
   окно после school shutdown.
3. Native Friends UI и controlled rollout foundation без attachments: завершены.
   Platform grant, отдельный org enable, revoke reset, desired/applied/observed
   generation и bounded convergence реализованы; production pilot evidence ещё
   не собрано.
4. Node-local ClamAV foundation реализован: один scanner stack на school-hosting
   node и отдельный relay каждой школы. Остаются independent review,
   production-like PostgreSQL/Docker/EICAR pilot и только затем attachment UI;
   attachments пока fail-closed.
5. School support native admin inbox functional scope завершён: отдельный
   capability, role-gated cached list/thread, unread summary, online idempotent
   reply/read и conflict-safe status/category/priority/assignment без optimistic
   updates. Privacy-safe delivery cards/SLA готовы для Tenant outbox и typed Core
   relay endpoint; остаются terminal failure policy/exact Core receipts, optional
   durable admin mutations; push ждёт реального delivery adapter.
6. Отложено до назначения профильного владельца: юридические ADR по
   minors/social/parent, retention, offline conflicts, ЮKassa/fiscalization и
   OS/store matrix. Billing, parent observer policy и store rollout не начинаются
   до утверждения соответствующих ADR.

**Протокол обновления:** после каждого завершённого цикла исполнитель обязан
обновить дату, числители/знаменатели, текущий этап, следующий roadmap и handoff;
сверить workstream table; добавить записи в `CHANGELOG.md` и `VERSIONS.md`.
Проценты меняются только при изменении указанной методики или закрытии её пункта.
Новая методика описывается рядом со значением, чтобы ряд оставался проверяемым.
<!-- /LIVE_PROGRESS -->

## 1. Зафиксированные решения

| Область | Решение |
|---|---|
| Друзья | Одноклассники или вся школа, выбирает школа |
| Доступ social по возрасту | Опциональный диапазон классов в админке школы |
| Видимость чатов родителям | Опционально в настройках школы |
| Модераторы | `school_admin` и `director`, одинаковые полномочия |
| Retention сообщений | Опционально в настройках школы в пределах platform policy |
| Ссылки в чатах | Запрещены |
| School admin → PERUM | Через организацию, org admin является обязательным посредником |
| Платёжный провайдер | ЮKassa |
| Тарификация | Число школ + кастомизация оформления школы + кастомизация лендинга |
| Mobile parity | Все роли, включая org/platform admin |
| Offline | Чтение и редактирование с локальным кешем/outbox |
| Магазины | App Store, Google Play, RuStore, Huawei AppGallery |
| ОС | Только актуальные версии; старые версии не поддерживаются |
| Push preview | Показывать отправителя и содержимое, с настройкой отключения |
| Вложения support/social | В первой версии, с защищённым upload pipeline |
| Mobile routing | Один global Core discovery URL; клиент не строит tenant URL самостоятельно |
| Выбор школы | Полный school host, QR/invite link или пара organization domain + school code |
| Публичность школ | Полный список школ организации анонимно не публикуется |
| Social operational rollout | `platform_admin` выдаёт grant, `org_admin` отдельно включает rollout своей школы, `school_admin` управляет tenant policy |
| Social revoke | Platform revoke атомарно сбрасывает org intent; новый grant требует повторного org enable |
| Social convergence | Core discovery закрывается сразу; available node подтверждает env generation свежим heartbeat, unavailable node остаётся `enforcement_pending` |
| Social shutdown retention | Operator shutdown не запускает удаление; school shutdown оставляет read-only историю на 30 дней, re-enable отменяет удаление, moderation hold сохраняет evidence |
| Production media scanner | Один node-local `clamd` на school-hosting node; каждая школа обращается только через свой relay, файлы не покидают node, Core не участвует в data plane |
| Scanner safety | `INSTREAM`, quarantine, fail-closed, signatures максимум 48 часов, минимум 8 ГиБ RAM; capabilities только после EICAR/network pilot |

## 2. Workstreams

### WS1. Учебный контур

1. Разделить `target_occurrence`, дату публикации и deadline ДЗ.
2. Добавить персональный статус выполнения ДЗ.
3. Backfill legacy Grade/Homework/ControlWork в `LessonOccurrence`.
4. Добавить версионирование occurrence и безопасный перенос урока.
5. Архивировать темы/предметы вместо destructive delete.
6. Закрепить optimistic concurrency для offline teacher journal.

### WS2. Friends и direct chats

Полная спецификация: [FRIENDS_CHAT_PLAN.md](FRIENDS_CHAT_PLAN.md).

Порядок:

1. School settings и capabilities.
2. Requests/friendships/blocks.
3. Search и web UI.
4. Conversations/messages/read cursors.
5. Attachments и antivirus/quarantine.
6. Reports/moderation/retention.
7. Polling rollout, затем WebSocket.
8. Native UI, push и offline outbox.

### WS3. Поддержка школы

Tenant хранит переписку пользователей со школой:

```text
student/teacher/parent → tenant support → school_admin/director
```

Таблицы:

- `support_tickets`;
- `support_messages`;
- `support_ticket_participants`;
- `support_ticket_events`;
- `support_attachments`.

API пользователей:

```http
GET/POST /api/support/tickets
GET      /api/support/tickets/{id}
POST     /api/support/tickets/{id}/messages
POST     /api/support/tickets/{id}/read
POST     /api/support/tickets/{id}/close
```

API школы:

```http
GET   /api/admin/support/tickets
GET   /api/admin/support/tickets/{id}
POST  /api/admin/support/tickets/{id}/messages
PATCH /api/admin/support/tickets/{id}
POST  /api/admin/support/tickets/{id}/assign
GET   /api/admin/support/unread-count
```

Web/native:

- FAB поддержки для student/teacher/parent;
- история и thread;
- admin inbox;
- badge, assignment, status, priority, category;
- loading/error/retry/offline outbox;
- вложения сразу, с тем же защищённым media pipeline.

### WS4. School admin → PERUM через организацию

Утверждённый маршрут:

```text
school_admin/director → tenant ticket → org_admin → core support → platform_admin
```

- School admin создаёт запрос эскалации.
- Org admin видит запрос, редактирует/подтверждает и отправляет в core.
- Без подтверждения org admin тикет не покидает организационный контур.
- Ответ platform admin возвращается org admin; org admin отправляет ответ школе.
- Состояния и сообщения синхронизируются через transactional outbox/inbox.
- Core хранит `org_id`, `school_id`, source actor и correlation ID.
- Вложения передаются только после явного подтверждения org admin.

### WS5. Биллинг и тарифы

#### Тарифная формула

```text
monthly_total = school_quantity_price
              + school_branding_package
              + organization_landing_package
              + negotiated_overrides
```

Единицы тарификации:

1. Количество активных школ организации.
2. Кастомизация оформления школ.
3. Кастомизация лендинга организации.

Не использовать число учеников как billable unit. Его можно собирать только для
capacity planning и anti-abuse limits.

#### Каталог

```text
billing_products
- school_slot
- school_branding
- organization_landing
```

```text
billing_prices
- product_id
- currency RUB
- amount_minor
- interval month | year
- effective_from/effective_to
- provider_price_id
- version
```

```text
subscriptions
- organization_id
- status
- current_period_start/end
- cancel_at_period_end
- provider_customer_id/subscription_id
- revision
```

```text
subscription_items
- subscription_id
- product_id
- price_id
- quantity
- metadata
```

Дополнительно:

- invoices;
- payments;
- refunds;
- billing_provider_events;
- organization_entitlement_overrides;
- usage_snapshots;
- entitlement_snapshots.

#### ЮKassa

1. Checkout создаётся только из локального invoice.
2. Используется idempotency key.
3. Redirect/return URL не подтверждает оплату.
4. Webhook проверяется и сверяет сумму, валюту и invoice.
5. Provider event ID уникален; повтор безопасен.
6. Есть reconciliation job и ручной operator fallback.
7. Поддерживаются возвраты и журнал всех переходов состояния.

#### Entitlements

Примеры:

```text
schools.max
school.branding.enabled
school.branding.theme_level
school.branding.custom_domain
organization.landing.enabled
organization.landing.custom_theme
organization.landing.custom_domain
social.enabled
support.attachments.enabled
```

Tenant получает versioned entitlement snapshot и продолжает работу при
временной недоступности core. Существующую остановку school app за просрочку не
развивать и не считать целевой моделью enforcement. До отдельного продуктового,
юридического и операционного решения просрочка не должна автоматически
останавливать учебный контур. Порядок ограничений, grace period, read-only и
восстановления сервиса проектируется отдельно перед реализацией enforcement.

#### UI

Org admin:

- конструктор тарифа по числу школ и опциям оформления;
- ежемесячная/годовая цена;
- checkout ЮKassa;
- счета, платежи, возвраты;
- usage и прогноз;
- отмена/смена пакета.

Platform admin:

- продукты и версии цен;
- подписки и subscription items;
- invoices/payments/provider events;
- receivables, overrides, reconciliation и audit.

### WS6. Общие пакеты web/mobile

```text
packages/
  api-schema       OpenAPI core/tenant + generated types
  api-client       platform-neutral transport/auth/errors/upload
  domain           roles/capabilities/mappers/validation
  query            TanStack query keys/options/mutations
  design-tokens    CSS + React Native tokens
  telemetry        общие event names и redaction
  test-utils       fixtures/factories
```

Web и native не делят JSX/CSS по умолчанию. Они делят контракты, бизнес-логику,
query layer и design tokens.

### WS7. Mobile-ready auth и discovery

```http
GET  CORE   /api/public/tenant-discovery?host={school_host}
POST CORE   /api/public/tenant-discovery
POST CORE   /api/auth/login
POST TENANT /api/login
POST TENANT /api/auth/refresh
POST TENANT /api/logout
GET  TENANT /api/auth/sessions
DELETE TENANT /api/auth/sessions/{id}
GET  TENANT /api/mobile/compatibility
GET  TENANT /api/mobile/capabilities
```

- Short-lived access token в памяти.
- Rotating refresh token в Keychain/Keystore/SecureStore.
- Server-side sessions и revoke.
- Canonical tenant URL только через core discovery.
- Cache namespace включает tenant и user.
- Logout/password reset очищает токены, кеш, outbox и push registration.

#### Каноническая схема входа и маршрутизации

У приложения есть один build-time адрес control plane, например
`https://admin.perum.app`. Это единственный заранее известный backend. Домены
организаций и школ не зашиваются в приложение и не выводятся клиентом из slug.

```text
                         global Core
                    discovery + core auth
                           /        \
          org/platform account      school account
                 Core session       tenant discovery
                                           |
                              https://school.org-domain/api
                                           |
                              tenant session + role routing
```

Поддерживаются три способа найти школу:

1. Полный school host или URL: `school.organization.ru` либо custom domain.
2. QR/invite link, выданный школой: он содержит opaque public school ID или
   одноразовый discovery code, но не credentials.
3. Домен организации + короткий school code. Core разрешает пару серверно и не
   раскрывает анонимному клиенту полный каталог школ организации.

Не использовать глобальный поиск пользователей по логину: одинаковый логин
может существовать в разных tenant-базах, а такой поиск раскрывает membership.
Если пользователь не знает школу, UI предлагает обратиться к школе или
отсканировать её QR-код.

Flow школьного пользователя:

1. Клиент отправляет известный host в существующий
   `GET /api/public/tenant-discovery` либо пару `organization_domain` +
   `school_code`/invite token в новый `POST` того же ресурса.
2. Core нормализует ввод, ищет только active `OrganizationDomain`,
   `Organization`, `School` и `SchoolDomain`, затем возвращает versioned
   discovery response.
3. Клиент проверяет compatibility, сохраняет tenant descriptor и создаёт
   API client с выданным `api_base_url`.
4. Login выполняется непосредственно в tenant через `POST /api/login`.
5. После `GET /api/user/me` роль определяет native navigation. Сессии разных
   школ изолированы и могут храниться параллельно.

Flow `org_admin` и `platform_admin` не проходит через school tenant: login и
дальнейшие запросы остаются в Core. Переключение школы org admin является
выбором контекста управления, а не входом под школьным пользователем.

Discovery response должен содержать:

```json
{
  "tenant_id": "opaque-stable-id",
  "organization_id": "opaque-stable-id",
  "school_id": "opaque-stable-id",
  "organization_name": "Организация",
  "school_name": "Школа",
  "matched_host": "alias.example.ru",
  "primary_host": "school.organization.ru",
  "api_base_url": "https://school.organization.ru/api",
  "web_base_url": "https://school.organization.ru",
  "descriptor_revision": "sha256-content-revision",
  "cache_ttl_seconds": 3600,
  "compatibility": {},
  "capabilities": {}
}
```

`tenant_id`, `organization_id` и `school_id` являются opaque public UUID, а не
последовательными database ID. `matched_host` нужен для диагностики alias,
`primary_host` является каноническим адресом. SecureStore, query cache, outbox,
push registration и telemetry partition key используют `tenant_id + user_id`,
а не hostname: смена домена не должна создавать дубликат аккаунта.

Deep/universal link сначала извлекает public school ID, затем подтверждает
актуальный URL через Core. Нельзя открывать сохранённый tenant URL без
rediscovery, если descriptor устарел. Custom schemes остаются fallback;
основной production-маршрут использует HTTPS Universal Links/App Links на
стабильном platform link domain.

Backend hardening для discovery:

- материализовать primary host каждой школы в `SchoolDomain` и удалить O(N)
  fallback по всем школам;
- учитывать active `OrganizationDomain` при разрешении organization domain;
- добавить public UUID и primary/matched host в response;
- объединить compatibility/capabilities core и tenant в versioned schema;
- ограничить discovery независимым sliding-window лимитом по IP, возвращать
  generic unavailable errors и вести audit без утечки school membership;
- поддержать смену primary domain и rediscovery по stable public ID;
- не передавать tenant access/refresh token в Core, URL или deep link.

### WS8. React Native

Стек: Expo development builds + Expo Router + EAS. Не WebView.

Полный parity включает:

- student;
- parent;
- teacher;
- school_admin/director;
- org_admin;
- platform_admin.

Сложные таблицы реализуются нативными tablet/phone workflows, а не копией
desktop grid. Infrastructure destructive actions требуют step-up authentication,
биометрию и typed confirmation.

#### Offline editing

Обязательный scope:

- persisted read cache;
- SQLite mutation outbox;
- idempotency key каждой мутации;
- entity version/ETag;
- `If-Match`;
- conflict response и conflict resolution UI;
- sync status на каждой редактируемой сущности;
- запрет silent last-write-wins.

Порядок включения offline mutations:

1. Preferences/read states.
2. Social/support messages.
3. Homework student state.
4. Teacher homework/topic edits.
5. Grades и журнал после отдельного conflict QA.
6. Admin operations только там, где операция идемпотентна и безопасна.

### WS9. Push и deep links

- Push preview показывает отправителя и содержимое согласно утверждённому
  требованию.
- Пользователь может отключить preview; school policy может принудительно
  скрывать sensitive categories.
- Payload содержит IDs и минимальный preview; API остаётся источником истины.
- APNs, FCM, RuStore-compatible provider и Huawei Push Kit скрыты за единым
  device/push abstraction.

Deep links:

```text
https://link.perum.app/s/{school_public_id}/schedule
https://link.perum.app/s/{school_public_id}/grades/{id}
https://link.perum.app/s/{school_public_id}/messages/{conversation}
https://link.perum.app/s/{school_public_id}/support/{ticket}
https://link.perum.app/o/{organization_public_id}/billing
https://link.perum.app/platform/support/{ticket}
perum://... (fallback после проверки через Core)
```

### WS10. Магазины и ОС

Поддерживаются:

- Apple App Store/TestFlight;
- Google Play;
- RuStore;
- Huawei AppGallery.

ОС: только актуальные версии на момент старта разработки. Конкретная матрица
фиксируется ADR перед созданием native-проекта и пересматривается ежегодно.
Рекомендуемый baseline на старте: текущая major и две ближайшие поддерживаемые
версии, без legacy Android/iOS. Huawei-устройства без Google services входят в
обязательную device matrix.

## 3. Общий media pipeline

Поскольку вложения нужны сразу и в social, и в support, создаётся один сервисный
контракт:

```text
upload_sessions
media_objects
media_bindings
media_scan_results
```

Flow:

1. Клиент запрашивает upload session.
2. Проверяются role, entitlement, MIME и quota.
3. Файл загружается в object storage.
4. Проверяются checksum, magic bytes и antivirus.
5. До статуса `clean` файл недоступен другим пользователям.
6. Signed URL имеет короткий TTL и object-level authorization.
7. Retention удаляет unbound/quarantined/expired objects.

## 4. Порядок реализации

### Этап 0. ADR и юридические политики, 2–4 недели

- social/parent/moderation policy;
- retention bounds;
- обработка данных несовершеннолетних;
- ЮKassa contract/fiscalization;
- offline conflict policy;
- current OS/store matrix.

### Этап 1. Shared contracts и mobile-ready backend, 6–10 недель

- workspaces и shared packages;
- OpenAPI generation/drift CI;
- platform-neutral client;
- refresh sessions/discovery/devices;
- media pipeline foundation.

### Этап 2. Учебный hardening, 4–8 недель

- Homework semantics;
- occurrence backfill;
- optimistic versions;
- safe lesson transfer;
- offline-ready mutation contracts.

### Этап 3. School support, 6–10 недель

- tenant API/web/native-ready contracts;
- attachments;
- admin inbox;
- notifications/outbox.

### Этап 4. Organization-gated core support, 4–8 недель

- escalation approval org admin;
- core schema и platform inbox;
- bidirectional outbox/inbox.

### Этап 5. Friends, 5–8 недель

- settings, search, requests, blocks, web UI.

### Этап 6. Chats и moderation, 10–16 недель

- messages, attachments, polling/WebSocket;
- reports/cases/actions;
- retention и anti-abuse.

### Этап 7. Billing catalog и ЮKassa, 12–18 недель

- products/prices/items;
- checkout/webhooks/refunds/reconciliation;
- entitlements/snapshots;
- org/platform UI;
- отдельное решение по последствиям просрочки и только затем staged enforcement.

### Этап 8. React Native foundation, 4–6 недель

- Expo/EAS;
- navigation/auth/cache/design system;
- push/deep links/files;
- offline outbox.

### Этап 9. Mobile parity

- Student: 8–12 недель.
- Parent: 4–7 недель.
- Teacher: 12–20 недель с offline journal.
- School admin/director: 10–18 недель.
- Org/platform admin: 8–14 недель.
- Store/security/accessibility hardening: 4–8 недель.

Работы выполняются параллельно несколькими командами; оценки указаны в
календарных неделях для одного основного потока и требуют уточнения после ADR.

### Evidence по workstreams на 2026-07-18

Обозначения: `готово` означает реализованный и проверенный базовый контур;
`частично` означает, что foundation или vertical slice есть, но workstream ещё
не соответствует Definition of Done.

| Приоритет | Направление | Статус | Что осталось |
|---:|---|---|---|
| P0 | Shared contracts | Частично | query/telemetry/test-utils, расширение curated OpenAPI и contract tests; tenant-scoped mobile auth adapter с single-flight refresh готов |
| P0 | Tenant discovery | Частично | готовы public UUID, indexed host/UUID/org-domain discovery, release manifest, authenticated deployment snapshot, Core/Tenant schema parity, atomic Mobile descriptor persistence, API/SemVer preflight, account-scoped capability gating и 24-часовой grace. Request-time traffic lease закрывает старые account/revision/route clients при resume, switch и release transition; automated lifecycle tests, named CI gate, scoped diagnostics, bounded telemetry и безопасный collector foundation зелёные. Остаются deliberate rollback, operator Mobile ledger export и реальный one-school pilot Stage F; детали в `DYNAMIC_MOBILE_DESCRIPTOR_PLAN.md` |
| P0 | React Native foundation | Частично | Expo/EAS app, Router, SecureStore, tenant discovery/login, auth bootstrap, role routing, tenant/account switcher, persisted read cache, preferences/Homework/messages, durable social/support read cursors и offline support ticket creation SQLite outbox, CI gates и manual EAS preview workflow готовы; остаются расширение offline mutation coverage, одноразовая Expo project/credentials initialization и push/deep links |
| P0 | Юридические ADR | Отложено | требуется профильный владелец: minors/social/parent policy, retention, offline conflicts, ЮKassa/fiscalization, OS/store matrix; зависимые billing, parent observer policy и store rollout не начинать |
| P1 | Учебный hardening | Частично | optimistic locking Grade, version-safe LessonOccurrence/safe transfer, preview/token-gated occurrence backfill и soft archive Subject/Topic готовы; Homework разделён на assigned/target occurrence, publication/deadline и versioned student state с web/mobile outbox, остаются обработка ambiguity report и расширенный conflict QA; multi-device QA временно отложен до готовности concurrency environment и preview window |
| P1 | Friends | Частично | durable social cursor, hardening, Native Friends UI и двухступенчатый platform grant → org enable rollout foundation готовы; revoke сбрасывает org intent, discovery fail-closed учитывает desired state, convergence подтверждается generation heartbeat. Остаются production pilot evidence, attachments, push и расширенный anti-abuse |
| P1 | Media pipeline | Частично | private storage/upload foundation и node-local ClamAV adapter готовы; один shared scanner на node изолирован per-school relay, durable leases/retries и readiness/backlog реализованы. Остаются independent review, approved digest images, PostgreSQL migration, real EICAR/network/outage/signature pilot и attachment UI; production attachments остаются fail-closed и выключенными |
| P1 | School support | Частично | text-only tickets/messages/shared read, notifications, assignment, version-safe metadata, audit history, web requester/admin UI, native requester durable outboxes и offline ticket creation готовы. Native school admin/director получил отдельный `support_admin` gate, cached list/thread, conflict-safe controls и privacy-safe Tenant outbox delivery/SLA card; остаются optional durable admin mutations, attachments, push и production SLA operations |
| P1 | Core support escalation | Частично | explicit redacted school request, durable tenant outbox, idempotent Core intake, org approval/rejection, platform visibility gate и privacy-safe platform → org → school admin relay с pull/ack готовы. Typed relay delivery endpoint выводит pending/delivered и SLA из ACK cursor; остаются exact delivery receipts, terminal failure policy, dashboards/alerts и native org/platform parity |
| P2 | Chats/moderation | Частично | 1:1 student text chats, durable read state, offline outbox, reports, evidence-scoped moderation/audit, operational shutdown, retention и foreground WebSocket realtime с polling fallback готовы; остаются groups, parent observer policy, attachments и расширенный anti-abuse |
| P2 | Billing/ЮKassa | Не начато | catalog, checkout/webhooks, refunds/reconciliation, entitlements и org/platform UI; остановку school app не развивать, enforcement спроектировать отдельно позже |
| P2 | Push/deep links | Частично | deep-link parser/rediscovery/routing/association routes, proof-of-possession installation, encrypted account registration, session revoke integration, privacy-safe suppressed outbox, Expo permission/token rotation/tap lifecycle готовы; остаются link DNS/signing identifiers, server encryption keys, EAS credentials и реальные Expo/APNs/FCM/RuStore/Huawei delivery adapters |
| P2 | Mobile role parity | Частично | student vertical slices Homework, Friends, Messages и Support requester готовы; school admin/director получили support inbox foundation. Остаются полный student parity, parent, teacher offline journal, остальные school admin/director и org/platform admin workflows |
| P3 | Production rollout | Не начато | security/accessibility/device matrix, stores, pilots, staged flags, metrics и rollback runbooks |

Live sequence и handoff не дублируются здесь: они редактируются только в блоке
`Live progress` в начале файла. Таблица выше хранит evidence и remaining scope по
workstreams; исполнимая матрица текущего Stage F находится в
[DYNAMIC_MOBILE_DESCRIPTOR_PLAN.md](DYNAMIC_MOBILE_DESCRIPTOR_PLAN.md).

## 5. CI и release gates

Обязательные проверки:

- core/tenant pytest;
- PostgreSQL и SQLite migration smoke;
- cross-school/cross-org RBAC matrix;
- OpenAPI drift;
- web typecheck/build/Playwright;
- mobile typecheck/unit/Maestro;
- Android/iOS preview builds;
- webhook idempotency/reconciliation;
- offline conflict tests;
- push/deep-link cold start;
- attachment MIME/malware/quarantine;
- accessibility и low-end device tests;
- secret/dependency/security scanning.

Production rollout:

1. Feature flags выключены по умолчанию.
2. Internal test org/school.
3. Несколько пилотных школ.
4. Наблюдение за abuse, billing и sync metrics.
5. Поэтапное включение.
6. Store staged rollout.
7. Runbook rollback/reconciliation для каждого workstream.

## 6. Definition of Done

Функция не считается готовой, пока нет:

- миграции и rollback/compatibility strategy;
- service-level authorization;
- OpenAPI и generated types;
- web и native UI либо явного approved platform exception;
- loading/error/empty/offline/conflict states;
- audit и observability;
- automated tests;
- manual role matrix;
- feature flag и rollout plan;
- документации поддержки и incident runbook.
