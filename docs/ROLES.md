# RBAC: роли и матрица прав

> Документ описывает иерархию ролей в новой архитектуре PERUM. Единый источник правды на фронте — `perum-web/src/lib/roles.ts`. На бэке — FastAPI dependencies (`require_platform_admin`, `require_org_admin`, ...).

## Иерархия

```
platform_admin    (Control Plane: admin.perum.ru)
       │
       │ управляет
       ▼
org_admin         (Tenant: <org>.perum.ru, custom domain)
       │
       │ управляет школами своей организации
       ▼
school_admin / director   (одна школа внутри орг)
       │
       │ управляет учителями, учениками, расписанием
       ▼
teacher / student / parent
```

Дополнительная роль `system_admin` из старого PERUM **не переносится** — её функции делятся между `platform_admin` (управление орг, мониторинг, биллинг) и `org_admin` (управление школами орг).

## Где живёт каждая роль

| Роль | Где живёт | На каком домене входит |
|---|---|---|
| `platform_admin` | `perum_control_db.platform_admins` | `admin.perum.ru` |
| `org_admin` | `org_*_db.users` (внутри tenant app) | `<org>.perum.ru` или кастомный |
| `school_admin` | `org_*_db.users` (с привязкой `school_id`) | `<org>.perum.ru` или кастомный |
| `teacher` | `org_*_db.users` (с `school_id`) | `<org>.perum.ru` или кастомный |
| `student` | `org_*_db.users` (с `school_id`) | `<org>.perum.ru` или кастомный |
| `parent` | `org_*_db.users` (с `school_id`) | `<org>.perum.ru` или кастомный |

`platform_admin` физически не существует в org-стеках. JWT, выданный `platform_admin` в control plane, не валиден в tenant app (другой `org_slug` в payload).

## Что может каждая роль

### platform_admin

- CRUD всех организаций.
- Видеть метрики/health всех орг.
- Управлять биллингом и подписками.
- Триггерить rolling-обновление tenant-образа.
- Подтверждать кастомные домены (вручную, если автоматика не справилась).
- НЕ имеет доступа к данным внутри org-стеков (ученики, оценки, ливки). Это инвариант — иначе теряем смысл silo.

### org_admin

- CRUD школ внутри своей орг.
- Инвайт `school_admin` для каждой школы.
- Просмотр сводных метрик по организации (количество учеников, активность).
- Управление кастомным доменом орг.
- Изменение биллинг-плана (если разрешено политикой).
- НЕ видит данные другой орг (физически невозможно).
- НЕ управляет внутренней структурой школы напрямую (это `school_admin`), но может вмешаться в виде override (для случаев когда `school_admin` уволился).

### school_admin / director

- CRUD пользователей школы (ученики, учителя, родители).
- CRUD классов, предметов, расписания, звонков.
- Управление учебным годом (миграция между годами).
- Управление маркетом, биржей, квестами для своей школы.
- Просмотр аналитики по школе.
- Видит только данные своей школы (`ensure_same_school` проверки).

### teacher

- Видит свои классы (где назначен через `TeacherSubject`).
- Выставляет оценки в свои предметы.
- Создаёт домашние задания, контрольные работы, темы.
- Импорт PDF-журнала для своих классов.
- Просмотр аналитики своих классов.
- Для классного руководителя — дополнительные права на «Мой класс» (массовое начисление ливок, просмотр сводки).
- НЕ редактирует чужих учителей, чужих классов, чужих учеников.

### student

- Свой dashboard (расписание, оценки, ливки).
- Биржа: инвестиции в предметы.
- Маркет: покупка товаров, gift upgrades.
- Квесты: участие, прогресс.
- Лидерборды.
- Подача апелляций на свои оценки.
- НЕ видит данных других учеников кроме публичных лидербордов.
- НЕ редактирует свой профиль кроме аватара/PFP.

### parent

- Видит дашборды своих детей (привязка через `ParentStudent`).
- Read-only: оценки, баланс, расписание.
- НЕ может писать в систему (выставлять оценки, покупать в маркете, инвестировать).

## Матрица прав (выборочно)

| Действие | platform | org_admin | school_admin | teacher | student | parent |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Создать организацию | ✓ | | | | | |
| Изменить план организации | ✓ | ✓¹ | | | | |
| Создать школу | | ✓ | | | | |
| Создать класс | | | ✓ | | | |
| Назначить учителя на предмет | | | ✓ | | | |
| Выставить оценку | | | | ✓² | | |
| Импорт PDF-журнала | | | | ✓² | | |
| Купить товар в маркете | | | | | ✓ | |
| Инвестировать на бирже | | | | | ✓ | |
| Подать апелляцию на оценку | | | | | ✓ | |
| Видеть оценки ребёнка | | | | | | ✓ |

¹ — если орг_admin сам платит.
² — только в своих предметах в своих классах.

## Реализация на бэке

`perum-tenant/app/core/auth.py` будет содержать (Phase 2):

```python
async def require_role(allowed_roles: list[str]):
    async def dep(current_user: User = Depends(get_current_user)):
        if current_user.role not in allowed_roles:
            raise HTTPException(403, "Forbidden")
        return current_user
    return dep

require_org_admin = require_role(["org_admin"])
require_school_admin = require_role(["org_admin", "school_admin"])  # org_admin тоже может
require_teacher = require_role(["org_admin", "school_admin", "teacher"])
require_student = require_role(["student"])
require_parent = require_role(["parent"])
```

И утилиты для row-level проверок внутри орг (Phase 5):

```python
def ensure_same_school(user: User, entity_school_id: int, detail: str = "Не найдено"):
    if user.role == "org_admin":
        return  # org_admin видит все школы своей орг
    if user.school_id != entity_school_id:
        raise HTTPException(404, detail)  # 404, не 403 (не раскрываем существование)

def ensure_teacher_owns_class(teacher: User, class_id: int, subject_id: int):
    # Проверка TeacherSubject — назначен ли учитель на этот предмет в этом классе
    ...
```

## Реализация на фронте

`perum-web/src/lib/roles.ts` (Phase 3):

```ts
export const ROLE_DASHBOARDS = {
  platform_admin: '/platform',
  org_admin: '/org-admin',
  school_admin: '/school-admin',
  teacher: '/teacher',
  student: '/student',
  parent: '/parent',
} as const;

export const ROLE_HIERARCHY = {
  org_admin: ['school_admin', 'teacher'],  // org_admin может то же, что и school_admin/teacher
  school_admin: ['teacher'],
  // …
} as const;

export function canAccess(userRole: Role, requiredRole: Role): boolean {
  if (userRole === requiredRole) return true;
  return ROLE_HIERARCHY[userRole]?.includes(requiredRole) ?? false;
}
```

Никакого хардкода ролей в нескольких местах (как в старом PERUM, `AUDIT_2026-04-17.md` P1-8).

## Что появляется на каждой фазе

- **Phase 0:** документ.
- **Phase 1:** `platform_admin` в `perum-core`.
- **Phase 2:** `org_admin`, `school_admin`, `teacher`, `student`, `parent` в `perum-tenant` с базовой проверкой.
- **Phase 3:** `roles.ts` на фронте.
- **Phase 5:** `ensure_same_school` и проверки teacher-subject ownership.
- **Phase 10:** полная матрица E2E-тестов «роль × эндпоинт».
