# Launch V1 Role Acceptance

> Рабочий evidence record для последнего критерия M2. Документ не содержит
> credentials, JWT, персональные данные или browser storage.

## Release Candidate

| Поле | Значение |
|---|---|
| Source commit | `930bb1f7d1cbfe9d1aada2aed6ed6c220a070473` |
| CI run | `30988476961`, success |
| Release run | `30988669533`, success |
| Web | `2.3.7`, `ghcr.io/syb1v/perum-web:git-930bb1f7d1cb`, digest `sha256:18c76cb02916e8ed3014f3d6f66ebcc8d40d17452ab9939155043d93dc0bf181` |
| Tenant | `1.1.11`, `ghcr.io/syb1v/perum-tenant:git-103e1f585536`, digest `sha256:9dcda32d51a6443bc8ef27f366331d8616cf0ad414fc4e351525b35aea0c2562` |
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
| A1 | School Admin | Учебный год, период, звонки, класс и предмет | Настройки создаются и повторно читаются через Web | PASS | ACC-001 исправлен, clean rerun |
| A2 | School Admin | Teacher, Student, Parent, назначение и связь ребёнка | Пользователи и связи сохраняются без SQL/seed backdoor | PASS | Web mutations и authoritative reads |
| A3 | School Admin | Расписание класса | Урок с назначенным Teacher виден после сохранения | PASS | ACC-002 исправлен, clean rerun |
| T1 | Teacher | Свои классы, расписание и журнал | Teacher видит только назначенный academic scope | PASS | Exact assignment и personal diary |
| T2 | Teacher | Посещаемость, оценка и домашнее задание | Все три mutation завершаются и отображаются в журнале | PASS | Grade/attendance/homework Web responses |
| S1 | Student | Расписание, дневник, оценка и домашнее задание | Student видит связанные authoritative academic records | PASS | Тот же grade и homework lesson detail |
| P1 | Parent | Выбор ребёнка, дневник, оценка и основные итоги | Parent видит только linked child и те же academic records | PASS | Linked-child grade/diary/finals tabs |
| U1 | School user | Создание text-only support ticket | Ticket появляется в requester thread | PASS | Student requester Web flow |
| O1 | School Admin | Support inbox, ответ и изменение состояния | Operator видит ticket; requester видит ответ и состояние | PASS | Reply виден requester; `waiting_requester` |

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
- Исправлен P1 `ACC-003`: journal homework создавался опубликованным, но без
  `due_date`, потому что exact deadline disabled до появления occurrence;
  Student diary показывал пустой homework. Web теперь передаёт выбранную journal
  date как legacy-compatible `due_date`, сохраняя optional exact deadline только
  для occurrence. Blocking Playwright journey проверяет visible `ДЗ` и заголовок
  задания в Student lesson detail.
- Open P0: 0
- Open P1: 0
- M2 acceptance: PASS
