# Утверждённый план друзей и личных чатов

> Это целевая спецификация требований, а не утверждение, что каждый пункт уже
> реализован. Live status и roadmap ведутся только в
> [PRODUCT_MASTER_PLAN.md](PRODUCT_MASTER_PLAN.md).

## Текущее состояние и requirement gap

Реализован базовый student vertical slice: school settings, поиск, заявки,
дружба/блокировки, direct text conversations, durable read state, web UI,
mobile Messages UI/offline outbox, privacy-safe audit/telemetry, operational
feature flag, reports, evidence-scoped moderation, retention и realtime с polling
fallback. Целевыми, но не завершёнными остаются Native Friends UI, parent observer
policy, attachments с production scanner, расширенный anti-abuse, push lifecycle,
groups (если будут утверждены отдельно) и controlled rollout.

## 1. Настройки школы

Все социальные функции управляются `school_admin` и `director`. Эти роли имеют
одинаковые полномочия модератора.

```text
social_enabled                       bool, default false
friend_scope                         classmates | school, default classmates
social_min_grade                     int | null, default null
social_max_grade                     int | null, default null
parent_chat_visibility               disabled | metadata | full, default metadata
message_retention_days               int, default 365
message_links_allowed                false, неизменяемо в первой версии
message_attachments_enabled          bool, default true
social_quiet_hours_start/end         time | null
social_moderation_enabled            bool, всегда true при social_enabled
```

- Администратор школы может включать social для любых классов через диапазон
  `social_min_grade`/`social_max_grade`.
- Область поиска и заявок выбирается между одноклассниками и всей школой.
- Видимость переписки родителям настраивается школой: полностью выключена,
  только метаданные или полный доступ.
- Срок хранения задаётся школой. Минимум и максимум ограничиваются платформой,
  чтобы школа не задала небезопасное или юридически недопустимое значение.
- Ссылки запрещены: backend отклоняет URL, frontend не делает linkify/preview.
- Вложения входят в первую production-версию, но проходят отдельный защищённый
  upload pipeline.

## 2. Модель данных

### `friend_requests`

- `id`, `school_id`, `requester_id`, `addressee_id`.
- `status`: `pending`, `accepted`, `rejected`, `cancelled`, `expired`.
- `client_request_id`, `created_at`, `responded_at`, `expires_at`.
- Запрет заявки себе, cross-school и пользователю вне разрешённого scope.
- Одна активная заявка на нормализованную пару пользователей.

### `friendships`

- `id`, `school_id`, `user_low_id`, `user_high_id`.
- `created_from_request_id`, `created_at`, `ended_at`, `ended_by_id`,
  `end_reason`.
- Одна активная дружба на нормализованную пару.

### `user_blocks`

- `id`, `school_id`, `blocker_id`, `blocked_id`.
- `source`: `user`, `moderator`, `system`.
- `reason_code`, `created_at`, `released_at`.
- Блокировка отменяет заявки, завершает дружбу и блокирует сообщения, но не
  удаляет историю.

### `conversations` и `conversation_members`

- Direct conversation: одна пара учеников, одна школа.
- `state`: `active`, `locked`, `archived`.
- Участник хранит `last_read_message_id`, mute/archive и notification settings.
- После удаления из друзей история доступна только для чтения.
- При отключении social школой история доступна только для чтения 30 дней, после
  чего retention удаляет сообщения без active moderation hold; повторное
  включение до срока отменяет удаление.
- Operator shutdown немедленно блокирует student social, но не запускает удаление
  и не изменяет школьный 30-дневный срок.

### `messages`

- `id`, `school_id`, `conversation_id`, `sender_id`.
- `client_message_id` для идемпотентной offline-отправки.
- `kind`: `text`, `attachment`, `system`.
- `body`, `created_at`, `edited_at`, `deleted_at`, `moderation_state`.
- `reply_to_message_id`.
- Plain text; URL запрещаются серверным валидатором.

### Вложения

`message_attachments`:

- object key, исходное имя, MIME, размер, checksum;
- uploader, message, scan status, timestamps;
- whitelist форматов и лимит размера;
- magic-byte проверка, antivirus/quarantine;
- короткоживущие signed download URL;
- никакого filesystem path в API.

### Модерация

- `message_reports` для жалоб.
- `moderation_cases` для расследований.
- `moderation_actions` как append-only аудит.
- `school_admin` и `director` имеют одинаковую moderator capability.
- Доступ к сообщениям выполняется через moderation case либо в соответствии с
  `parent_chat_visibility`, а не через свободный просмотр всех диалогов.

## 3. API

### Настройки и поиск

```http
GET   /api/social/settings
PATCH /api/admin/social/settings
GET   /api/social/students?query=&cursor=&limit=
```

### Друзья

```http
GET    /api/social/friend-requests?direction=incoming|outgoing
POST   /api/social/friend-requests
POST   /api/social/friend-requests/{id}/accept
POST   /api/social/friend-requests/{id}/reject
POST   /api/social/friend-requests/{id}/cancel
GET    /api/social/friends?cursor=
DELETE /api/social/friends/{student_id}
GET    /api/social/blocks
POST   /api/social/blocks
DELETE /api/social/blocks/{student_id}
```

### Чаты

```http
GET  /api/social/conversations?cursor=
POST /api/social/conversations
GET  /api/social/conversations/{id}/messages?before=&limit=
POST /api/social/conversations/{id}/messages
POST /api/social/conversations/{id}/read
POST /api/social/conversations/{id}/archive
POST /api/social/conversations/{id}/mute
POST /api/social/reports
```

### Модерация

```http
GET  /api/admin/social/moderation/cases
GET  /api/admin/social/moderation/cases/{id}
POST /api/admin/social/moderation/cases/{id}/actions
```

## 4. Realtime, push и offline

1. REST и cursor pagination являются источником истины.
2. Первый rollout может использовать visibility-aware polling.
3. Production realtime: short-lived single-use ticket для `/ws/social`.
4. Каждое событие имеет `event_id`, `version`, `occurred_at`, `school_id`.
5. Web использует IndexedDB outbox, mobile использует локальную SQLite/outbox.
6. Сообщение всегда имеет `client_message_id`; retry не создаёт дубль.
7. Push preview включён по утверждённому требованию: показывает отправителя и
   текст. Пользователь и школа могут отключить preview; на заблокированном
   экране ОС содержимое защищается настройками платформы настолько, насколько
   это позволяют APNs/FCM/Expo.
8. Push не является источником данных: приложение загружает сообщение через API.

## 5. Web и React Native

Web:

- `/student/friends`;
- `/student/messages`;
- moderation inbox в админке школы;
- badge непрочитанных в Header/MobileNav.

React Native:

- нативные Friends и Messages screens;
- optimistic outbox и retry;
- push/deep link в conversation;
- безопасный file picker/upload/download;
- block/report доступны из меню диалога и сообщения.

## 6. Критерии готовности

- Настройки школы реально ограничивают API, не только UI.
- Cross-school запросы возвращают 404/403 без раскрытия данных.
- Без дружбы сообщение невозможно.
- Block немедленно закрывает отправку.
- URL отклоняется backend.
- Вложения проходят quarantine/scan до скачивания.
- Parent visibility соответствует настройке школы.
- Модераторы ограничены `school_admin` и `director`.
- Offline retry идемпотентен.
- Unread/read cursor согласован между web и native.
- Retention job протестирован на активных, удалённых и reported сообщениях.
