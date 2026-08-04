# Launch V1 Role Acceptance

> Рабочий evidence record для последнего критерия M2. Документ не содержит
> credentials, JWT, персональные данные или browser storage.

## Release Candidate

| Поле | Значение |
|---|---|
| Source commit | заполняется после RC commit |
| CI run | заполняется после успешного CI |
| Release run | заполняется после успешного release workflow |
| Web | `2.3.6`, immutable image identity заполняется после публикации |
| Tenant | `1.1.11` candidate: исправляет P1 academic dates и Teacher schedule projection; identity заполняется после публикации |
| Contour | disposable PostgreSQL, production Web build, Chromium `ru-RU`, timezone `Europe/Moscow` |
| Data | synthetic users и academic/support records, созданные только внутри disposable contour |

## Severity Gate

- P0: обязательный Launch V1 journey недоступен, нарушена school isolation,
  authorization/privacy или данные повреждаются без безопасного обхода.
- P1: обязательный journey даёт неверный результат либо не завершается штатным
  пользователем; безопасный временный обход не подходит для pilot school.
- Любой открытый P0/P1 блокирует M2 acceptance. После исправления повторяются
  failed row и все зависимые downstream rows.

## Matrix

| ID | Роль | Проверка | Ожидаемый результат | Статус | Evidence/defect |
|---|---|---|---|---|---|
| A1 | School Admin | Учебный год, период, звонки, класс и предмет | Настройки создаются и повторно читаются через Web | PENDING | — |
| A2 | School Admin | Teacher, Student, Parent, назначение и связь ребёнка | Пользователи и связи сохраняются без SQL/seed backdoor | PENDING | — |
| A3 | School Admin | Расписание класса | Урок с назначенным Teacher виден после сохранения | PENDING | — |
| T1 | Teacher | Свои классы, расписание и журнал | Teacher видит только назначенный academic scope | PENDING | — |
| T2 | Teacher | Посещаемость, оценка и домашнее задание | Все три mutation завершаются и отображаются в журнале | PENDING | — |
| S1 | Student | Расписание, дневник, оценка и домашнее задание | Student видит связанные authoritative academic records | PENDING | — |
| P1 | Parent | Выбор ребёнка, дневник, оценка и основные итоги | Parent видит только linked child и те же academic records | PENDING | — |
| U1 | School user | Создание text-only support ticket | Ticket появляется в requester thread | PENDING | — |
| O1 | School Admin | Support inbox, ответ и изменение состояния | Operator видит ticket; requester видит ответ и состояние | PENDING | — |

## Automated Preconditions

- PostgreSQL API journey: School Admin setup → Teacher grade mutation → Student и
  linked Parent reads с negative RBAC checks.
- Playwright browser journey: Teacher mutation → тот же `grade_id` в Student и
  linked Parent Web/API projections.
- Tenant support unit suite: requester ownership, school isolation, operator
  inbox/replies/status/events/escalation semantics.

## Result

- Исправлен P1 `ACC-001`: Web отправлял UTC-aware academic year/period dates,
  которые PostgreSQL `TIMESTAMP WITHOUT TIME ZONE` отклонял с HTTP `500`.
  Tenant boundary теперь нормализует aware timestamps в naive UTC; regression
  проходит с фактическим Web-shaped `...Z` payload на PostgreSQL.
- Исправлен P1 `ACC-002`: обычный урок, созданный School Admin через Web, не
  содержал `teacher_id`, поэтому назначенный Teacher видел `Нет уроков`. Tenant
  теперь подставляет teacher только при единственном active exact
  class+subject assignment; нулевой или неоднозначный набор остаётся fail-closed
  с warning. PostgreSQL journey закрепляет Web-shaped schedule payload без
  `teacher_id` и появление урока в Teacher diary.
- Open P0: pending
- Open P1: pending
- M2 acceptance: pending
