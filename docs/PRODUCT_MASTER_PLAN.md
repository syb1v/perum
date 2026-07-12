# PERUM: утверждённый master-plan функций, биллинга и приложений

> Статус: продуктовые решения утверждены 2026-07-11. План задаёт порядок
> реализации backend, API, web и React Native от миграций до production rollout.

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
временной недоступности core. При просрочке сначала блокируется рост и premium
customization, а учебные данные переходят в read-only только после grace.

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
POST /api/mobile/discover-school
POST /api/auth/login
POST /api/auth/refresh
POST /api/auth/logout
GET  /api/auth/sessions
DELETE /api/auth/sessions/{id}
PUT/DELETE /api/devices/{installation_id}
GET /api/mobile/compatibility
GET /api/mobile/capabilities
```

- Short-lived access token в памяти.
- Rotating refresh token в Keychain/Keystore/SecureStore.
- Server-side sessions и revoke.
- Canonical tenant URL только через core discovery.
- Cache namespace включает tenant и user.
- Logout/password reset очищает токены, кеш, outbox и push registration.

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
perum://school/{school}/schedule
perum://school/{school}/grades/{id}
perum://school/{school}/messages/{conversation}
perum://school/{school}/support/{ticket}
perum://org/{org}/billing
perum://platform/support/{ticket}
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
- staged enforcement.

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
