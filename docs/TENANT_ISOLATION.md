# Изоляция tenant-данных

Главный инвариант: одна школа = отдельный tenant runtime + отдельная school DB +
отдельные persistent volumes и credentials.

## Уровни

| Граница | Механизм |
|---|---|
| Между школами | Разные app/DB containers, DB credentials, secrets, volumes и tenant identity |
| Core и школа | Разные базы и auth domains; Core хранит metadata, но не school records |
| Внутри школы | Role dependencies, ownership checks и `school_id` scope для связанных записей |
| Remote node | Node assignment + authenticated Agent API; school stacks всё равно отдельны |
| Mobile cache | Namespace по stable tenant/account identity, не только hostname |

## Правила разработки

- Не добавлять Core SQL connections к school DB.
- Не принимать organization/school scope от клиента, если он уже определяется
  authenticated principal или tenant runtime.
- Любой fetch по произвольному ID в tenant обязан проверить school/owner scope до
  возврата или изменения.
- Cross-boundary denial обычно не должен подтверждать существование чужой записи.
- Core tokens не принимаются tenant API; tenant tokens не принимаются Core API.
- Internal RPC token и telemetry token не взаимозаменяемы.
- Новые cache/outbox/push keys включают tenant и account identity.

## Проверка

Unit suites содержатся в `perum-core/tests/` и `perum-tenant/tests/unit/`.
Дополнительный live script `deploy/tests/isolation_e2e.sh` требует специально
подготовленного стенда. Любой новый ID-based endpoint должен получить позитивный,
cross-school и cross-role test.

При подозрении на утечку следуйте incident procedure в [RUNBOOK.md](RUNBOOK.md):
сначала ограничьте доступ, сохраните evidence и ротируйте затронутые credentials,
не уничтожая данные до forensic snapshot.
