# Hardening — RBAC-матрица, изоляция, тесты (Фаза 10)

Сводка безопасности PERUM v2 («узел организации», silo = школа). Роли — [ROLES.md](ROLES.md),
архитектура — [ARCH_ORG_NODE.md](ARCH_ORG_NODE.md).

## Три уровня доступа

| Уровень | Роль | Токен (role) | Скоуп |
|---|---|---|---|
| Платформа (ядро) | `platform_admin` | `platform_admin` | все организации, релизы, домены-gate |
| Узел орг (ядро/агент) | `org_admin` | `org_admin` + `org_id` | школы своей орг (НЕ внутрь школы) |
| Стек школы | `school_admin`/`director`/`teacher`/`student`/`parent` | школьный JWT (`org_slug`) | одна школа |

Токены **не пересекают уровни**: JWT платформы/орг невалиден в школьном стеке
(другой `SECRET_KEY` + проверка `org_slug`), школьный — невалиден в ядре.

## RBAC-матрица (ядро, perum-core)

| Эндпоинт | platform_admin | org_admin | школьный токен / аноним |
|---|:--:|:--:|:--:|
| `POST /api/auth/login` | ✅ | ✅ | — (выдаёт по логину) |
| `GET/POST /api/organizations*` | ✅ | 401 | 401 |
| `POST /api/organizations/{slug}/org-admins` | ✅ | 401 | 401 |
| `POST /api/organizations/{slug}/enrollment-token` | ✅ | 401 | 401 |
| `GET/PUT /api/organizations/{slug}/billing` | ✅ | 401 | 401 |
| `GET/POST /api/releases` | ✅ | 401 | 401 |
| `GET/POST/DELETE /api/schools*` | 401 | ✅ (своя орг) | 401 |
| `POST /api/schools/{id}/update` (OTA) | 401 | ✅ | 401 |
| `*/schools/{id}/domains` | 401 | ✅ | 401 |
| `POST /api/enroll` | — | — | по токену (одноразовый) |
| `GET /internal/validate-domain` | внутренний (Caddy по сети) |
| `GET /metrics` | внутренний (Prometheus по сети, не через Caddy) |

## RBAC-матрица (стек школы, perum-tenant)

| Группа эндпоинтов | school_admin/director | teacher | student/parent |
|---|:--:|:--:|:--:|
| `/api/admin/*` (предметы, классы, юзеры, расписание, аналитика) | ✅ | 403 | 403 |
| `/api/journal/*`, выставление оценок | ✅ | ✅ (свои классы) | 403 |
| `/api/student/*` | — | — | ✅ (свои данные) |
| `/api/parent/*` | — | — | ✅ (свои дети) |

`org_admin` в школьном стеке **физически отсутствует** → внутришкольные эндпоинты
для него недостижимы (нет учётки + токен невалиден).

## Инварианты изоляции (проверяются `deploy/tests/isolation_e2e.sh`)

1. **cross-school:** токен школы A → школа B = **401**.
2. **same-school:** токен школы A → школа A = **200**.
3. **cross-level:** платформенный токен → школьный стек = **401**; школьный токен →
   ядро = **401**.
4. **БД-изоляция:** у каждой школы своя БД/том/контейнер (нет общих данных).

## Тесты

- **Юнит/гейты ядра:** `perum-core/tests/` — 56 passed (включая `test_v2_rbac.py`:
  разделение уровней + чистая логика биллинга). Запуск:
  `docker run --rm -v "$PWD/perum-core:/app:ro" perum-core:dev sh -c "pip install -q pytest && cd /app && python -m pytest -q"`.
- **Изоляция (live):** `bash deploy/tests/isolation_e2e.sh` (требует поднятый стенд +
  школы acme/demo1).
- **Нагрузка:** `BASE=http://admin.perum.local k6 run deploy/tests/load_test.js`
  (smoke: p95 ~2.6ms, 0% ошибок при 10 VU). Пороги: p95<800ms, ошибок <1%.

## Известные ограничения (бэклог hardening)
- Секреты школ/орг — plaintext в control-БД (TODO: KMS/Vault).
- `/metrics` без auth — полагается на сетевую изоляцию (закрыть на проде по сети).
- Rate-limiting на login — не реализован (TODO).
- Вложения ДЗ — container-local, не на volume (TODO).
