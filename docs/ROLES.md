# Роли и границы доступа

## Core roles

| Роль | Scope |
|---|---|
| `platform_admin` | Организации, ноды, platform settings, releases, platform support и billing operations |
| `org_admin` | Только своя организация: школы, school admins через ограниченный RPC, updates, org support и доступные org settings |

`org_admin` управляет жизненным циклом школы, но не получает учебные данные и не
становится school user.

## Tenant roles

| Роль | Scope |
|---|---|
| `school_admin`, `director` | Управление одной школой; для moderation/support считаются равноправными администраторами |
| `teacher` | Назначенные классы/предметы, журнал, задания и teacher analytics |
| `student` | Свои учебные данные и разрешённые social/gamification actions |
| `parent` | Привязанные дети и разрешённые parent/support actions |

Backend authorization является источником истины. Frontend role routing и
capability gating не заменяют проверки FastAPI dependencies/services. Роли Core и
Tenant принадлежат разным token domains; не создавайте иерархию, в которой
`org_admin` автоматически наследует `school_admin` или `teacher`.

При добавлении endpoint проверьте role, active status, organization/school scope,
ownership и tests для запрещённых соседних ролей. Точный API surface генерируется
по [API_CONTRACTS.md](API_CONTRACTS.md).
