# PERUM Launch Master Plan

> Единственный live-источник launch scope, прогресса и порядка работ.
> Обновлено: 2026-08-02. Всё, что не блокирует первый коммерческий запуск,
> находится в [POST_LAUNCH_BACKLOG.md](POST_LAUNCH_BACKLOG.md).

## 1. Цель

Запустить Web-first SaaS для первых школ с безопасным multi-tenant contour,
основными учебными сценариями, поддержкой и минимально достаточным коммерческим
учётом.

Полная Web/Mobile parity, stores, attachments, advanced social, offline mutations
и автоматизация всех коммерческих операций не блокируют Launch V1.

## 2. Прогресс Запуска

| Milestone | Вес | Выполнено | Вклад | Состояние |
|---|---:|---:|---:|---|
| M1. Scope Lock | 10% | 4/4 | **10.0%** | Готово |
| M2. Core Web Journeys | 35% | 6/8 | **26.3%** | Incident закрыт, Web acceptance открыт |
| M3. Commercial Readiness | 20% | 1/5 | **4.0%** | Требует решений |
| M4. Production Proof | 25% | 3/8 | **9.4%** | Частично доказано |
| M5. Pilot and Launch | 10% | 0/4 | **0.0%** | Не начато |
| **Итого** | **100%** | | **49.6%** | `██████████░░░░░░░░░░` |

Общий launch progress: **50%**. Процент меняется только при закрытии критериев
ниже, а не от количества endpoint, экранов, commits или tests.

## 3. Launch V1 Scope

### Обязательные роли и сценарии

- School Admin в Web настраивает учебный год, периоды, звонки, классы, предметы,
  учителей, учеников и расписание.
- Teacher в Web видит свои классы и расписание, ведёт журнал, оценки,
  посещаемость и домашние задания.
- Student в Web видит актуальные расписание, дневник, оценки и домашние задания.
- Parent в Web выбирает ребёнка и видит его дневник, оценки и основные итоги.
- Пользователь школы создаёт support ticket; school/platform operator видит и
  обрабатывает обращение.
- Platform operator создаёт, обновляет, диагностирует, архивирует и восстанавливает
  школу по documented runbook.

### Обязательный production contour

- Одновременно работают минимум две изолированные школы.
- Deploy использует immutable identity, health gate и rollback.
- Backup восстанавливается с проверяемым schema/data proof.
- Ошибки API, health и capacity наблюдаемы; P0 alert доходит оператору.
- Critical authorization, school isolation и privacy проходят review.
- Есть законный тариф, договорный/payment flow и понятные lifecycle rules.
- Одна внешняя pilot school принимает основные journeys.

### Клиенты Launch V1

- Web является полным и обязательным клиентом.
- Mobile остаётся preview/read-only companion и не блокирует Web launch.
- Mobile stores, push и signed-device acceptance не входят в Launch V1.

## 4. Exit Criteria

### M1. Scope Lock: 4/4

- [x] Web-first Launch V1 scope зафиксирован.
- [x] Обязательные роли и journeys перечислены.
- [x] Не блокирующий scope перенесён в post-launch backlog.
- [x] Feature freeze принят: до launch допускаются только launch criteria,
  P0/P1 defects, security/privacy и обязательные commercial tasks.

### M2. Core Web Journeys: 6/8

- [x] School Admin academic setup реализован в Web.
- [x] Teacher journal/grade/attendance/homework flow реализован в Web.
- [x] Student diary/grades/homework flow реализован в Web.
- [x] Parent child academics flow реализован в Web.
- [x] Deterministic PostgreSQL API E2E проходит School Admin setup → Teacher grade
  mutation → Student и linked Parent academic reads с реальными auth/RBAC/routes.
- [ ] Browser E2E на release candidate подтверждает Teacher mutation и тот же
  Student/Parent result через Web.
- [ ] Role acceptance matrix пройдена на release candidate без открытых P0/P1.
- [x] Production Student diary работает на Tenant `1.1.8`: immutable OTA, healthy
  runtime identity и authenticated HTTP 200 smoke подтверждены.

### M3. Commercial Readiness: 1/5

- [x] Delinquency reconciliation не уничтожает данные и не останавливает школу.
- [ ] Зафиксированы Launch V1 tariff, trial, grace, cancellation и retention rules.
- [ ] Утверждён законный Launch V1 payment flow: manual invoice или YooKassa.
- [ ] Operator может сверить начисление, оплату, долг и entitlement по audit trail.
- [ ] Договор, privacy notice и support/SLA boundaries приняты владельцем продукта.

Полная автоматизация YooKassa не обязательна, если владелец и бухгалтерия
утвердили ручной invoice/payment flow для первых школ.

### M4. Production Proof: 3/8

- [x] One-school provisioning, HTTPS и role smoke подтверждены.
- [x] Immutable deploy/rollback identity подтверждён.
- [x] Exact backup/restore proof подтверждён.
- [ ] Две active школы одновременно проходят isolation smoke.
- [ ] Bounded production-like read load проходит без cross-school leakage/errors.
- [ ] P0 alert доставляется во внешний approved receiver.
- [ ] Critical API проходят authorization/privacy/security review.
- [ ] Incident runbook, RTO/RPO и ответственные приняты оператором.

### M5. Pilot and Launch: 0/4

- [ ] Внешняя pilot school проходит все Launch V1 journeys.
- [ ] Нет открытых P0/P1 launch defects.
- [ ] Support/operator проводят incident drill по runbook.
- [ ] Product owner и service owner подписывают launch acceptance.

## 5. Критический План

Работа выполняется целыми journeys/gates, а не отдельными мелкими экранами.

### P0. Стабилизировать текущий production

1. Устранить telemetry contract drift и оставить social rollout fail-closed без
   повторного Web polling.

### P0. Закрыть Core Web acceptance

1. Добавить browser layer поверх deterministic API fixture без повторения setup UI.
2. Пройти ручную role matrix на одном release candidate.
3. Исправить найденные P0/P1 одним vertical release, без нового feature scope.

### P0. Принять минимальную коммерцию

1. Владелец выбирает manual invoice или YooKassa для Launch V1.
2. Зафиксировать tariff/trial/grace/cancellation/retention rules.
3. Реализовать только недостающие audit/reconciliation/entitlement операции
   выбранного flow.
4. Принять договорные, privacy и support boundaries.

### P0. Доказать production contour

1. Получить approved вторую школу и провести simultaneous isolation smoke.
2. Выполнить bounded read-only load test для двух школ.
3. Подключить внешний P0 alert receiver и доказать firing/resolved delivery.
4. Провести focused authorization/privacy review критических Launch API.
5. Принять RTO/RPO, ownership и incident runbook.

### P1. Pilot and launch

1. Подключить одну внешнюю pilot school.
2. Пройти acceptance journeys и incident drill.
3. Закрыть P0/P1 defects без расширения scope.
4. Получить формальное разрешение на launch.

## 6. Правила Ускорения

- До Launch V1 действует feature freeze.
- Один цикл закрывает journey или production gate, а не один endpoint/screen.
- Tenant/Web version повышается для release candidate или incident fix, а не для
  каждого небольшого изменения.
- Production rollout выполняется только после CI, immutable identity и health gate.
- Contract, authorization, migrations, backup/restore и rollback не упрощаются.
- Документация фиксирует текущий результат и следующий exit criterion без
  incident chronology, hashes, digests и завершённых микропланов.
- Новая задача сначала должна указать конкретный Launch V1 criterion. Если такого
  критерия нет, она отправляется в post-launch backlog.

## 7. Методика Прогресса

Для milestone:

`progress = закрытые exit criteria / все exit criteria`

Общий прогресс:

`10% × M1 + 35% × M2 + 20% × M3 + 25% × M4 + 10% × M5`

Текущий расчёт:

`10 × 4/4 + 35 × 6/8 + 20 × 1/5 + 25 × 3/8 + 10 × 0/4 = 49.6%`

После каждой итерации обязательно обновляются checkbox затронутого milestone,
формула, общий процент, критический план, `CHANGELOG.md` и `docs/VERSIONS.md`.
Критерий закрывается только по проверяемому evidence.

## 8. Definition of Launch Ready

Launch V1 готов только когда:

- M1–M5 закрыты на 100%; общий launch progress равен 100%;
- нет открытых P0/P1 defects;
- обязательные Web journeys приняты pilot school;
- isolation, backup/restore, deploy/rollback, alerting и security доказаны;
- commercial/legal flow принят ответственными;
- support и operator готовы работать по runbook.

## 9. Ссылки

- [Post-launch backlog](POST_LAUNCH_BACKLOG.md)
- [Архитектура](ARCHITECTURE.md)
- [API contracts](API_CONTRACTS.md)
- [Production runbook](RUNBOOK.md)
- [Releasing](RELEASING.md)
- [Testing](TESTING.md)
- [Operator evidence](OPERATOR_EVIDENCE_2026-07-30.md)
- [Changelog](../CHANGELOG.md)
- [Commit ledger](VERSIONS.md)
