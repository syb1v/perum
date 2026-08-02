# Требования для возобновления отложенных этапов

Документ хранит prerequisites и evidence для двух post-launch этапов. Они не
блокируют Web-first Launch V1 и перечислены в
[POST_LAUNCH_BACKLOG.md](POST_LAUNCH_BACKLOG.md). Live status и launch progress
ведутся только в [PRODUCT_MASTER_PLAN.md](PRODUCT_MASTER_PLAN.md).

## Этап 2. Stage F one-school pilot

### Что предоставляет владелец проекта

1. Одну явно выбранную opt-in школу и её public UUID.
2. Временный least-privilege operator access через approved secret manager или
   внешний operator runbook. Credentials не передаются в чат или репозиторий.
3. Согласованное окно пилота без параллельных deploy/update выбранной школы.
4. Свежий backup и подтверждённую restore point.
5. Исходный release tag/image digest и совместимый rollback image. Schema
   downgrade без отдельной migration strategy запрещён.
6. Pilot Mobile build и отдельный тестовый school account без реальных
   пользовательских данных или административных полномочий.
7. Доступ к redacted Core/mobile telemetry для unknown release, grace fallback и
   incompatible client.
8. Оператора и наблюдателя, уполномоченных подписать operator record.

### Что выполняет инженер

1. Baseline discovery/login и фиксацию descriptor revision, release identity,
   effective capabilities и health без secrets/PII.
2. Unknown-release fail-closed сценарий.
3. LKG grace для network error, `429` или `5xx` с сохранением account/outbox.
4. Incompatible-client blocked UX без tenant traffic и fallback.
5. Recovery исходного release, свежего snapshot и health/data smoke.
6. Privacy-safe operator record по checklist из
   [DYNAMIC_MOBILE_DESCRIPTOR_PLAN.md](DYNAMIC_MOBILE_DESCRIPTOR_PLAN.md).

### Условия остановки

Работа немедленно останавливается при identity mismatch, tenant traffic в blocked
сценарии, потере account/outbox, migration или health failure, отсутствии backup,
rollback image или redacted telemetry. Stage F нельзя закрыть частичным либо
синтетическим evidence.

### Exit criteria

- operator record содержит все обязательные поля и итог `pass`;
- baseline и recovery health/data smoke успешны;
- unknown-release, grace и incompatible-client telemetry подтверждены;
- только после этого lifecycle matrix становится `12/12`, descriptor `11/11`, а
  descriptor stages `6/6`.

## Этап 5. Homework multi-device conflict QA

### Что предоставляет владелец проекта

1. Локальный или CI PostgreSQL instance для конкурентных integration tests без
   production-данных.
2. Возможность запускать две независимые DB sessions/API clients с управляемыми
   barriers.
3. Mobile preview QA window после прохождения автоматизированной матрицы.
4. Android или iOS preview build с Expo SQLite.
5. Тестового ученика и опубликованное Homework в тестовой школе.
6. Телефон и браузер либо два mobile-клиента для mixed-client smoke.
7. Разрешение на airplane mode, force-kill, restart и reconnect тестового клиента.
8. Подтверждение policy нескольких offline-нажатий одного Homework. Рекомендуемая
   политика: последний ещё не отправленный intent заменяет предыдущий и не
   создаёт self-conflict.
9. Подтверждение UX выбора: принять server snapshot либо повторить local intent
   поверх свежей version.

### Что выполняет инженер

1. Делает Homework state и idempotency receipt атомарной транзакцией.
2. Исправляет immutable replay snapshot и concurrent first-write `409` contract.
3. Добавляет PostgreSQL concurrency/lost-response tests для first write и CAS.
4. Устраняет self-conflict нескольких local intents одного Homework.
5. Делает local conflict replacement атомарным в SQLite.
6. Немедленно применяет выбранный server snapshot к account-scoped cache.
7. Проверяет restart persistence, account isolation и malformed/permanent states.
8. Выполняет mixed web/mobile smoke после зелёной автоматизированной матрицы.

### Условия остановки

Работа останавливается до изменения production semantics, если нет PostgreSQL
concurrency environment либо не утверждена policy нескольких local intents.
Manual preview не начинается при незелёных tenant/mobile tests. Нельзя расширять
offline teacher journal или Grade mutations до закрытия этой матрицы.

### Exit criteria

- один concurrent writer побеждает, второй получает стабильный полный `409`;
- lost response повторяется тем же action ID и возвращает consistent replay;
- server/local resolution не теряет intent при crash;
- SQLite restart и account isolation подтверждены автоматически;
- mobile preview подтверждает airplane mode, force-kill/restart и mixed-client UX;
- `PRODUCT_MASTER_PLAN.md` обновлён только после automated и manual evidence.

## Как возобновлять

1. Владелец проекта сообщает, какой этап готов, и предоставляет перечисленные
   prerequisites через approved channels.
2. Инженер сначала проверяет полноту prerequisites без production mutation.
3. При отсутствии любого обязательного условия инженер останавливается и сообщает
   конкретный blocker.
4. Каждый возобновлённый этап выполняется отдельным циклом и коммитом.
