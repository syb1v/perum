# Инструкция для AI-агентов (PERUM v2)

> Последнее обновление: 2026-06-16. Этот файл — единый источник правил работы с кодовой базой PERUM для любых AI-агентов. Соблюдать обязательно.

---

## 1. О проекте

**PERUM** — многоарендная (multi-tenant) школьная SaaS-платформа: геймифицированный электронный журнал с рейтингами, биржей, маркетом, квестами и аналитикой.

**Архитектура (v2, silo-per-SCHOOL):** монорепо из 3 микросервисов + инфраструктура:

| Компонент | Роль | Язык | Путь |
|-----------|------|------|------|
| `perum-core/` | Control Plane — управляет организациями, школами, биллингом, провижинингом, релизами | **Python 3.12** (FastAPI) | `perum-core/` |
| `perum-tenant/` | Tenant App — одна инстанция на школу: журнал, оценки, геймификация | **Python 3.12** (FastAPI) | `perum-tenant/` |
| `perum-web/` | Frontend — единая сборка Next.js для всех tenant'ов | **TypeScript 5** (React 19 / Next.js 16) | `perum-web/` |

Ключевые доки:
- [docs/PLAN.md](docs/PLAN.md) — роадмап по фазам
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — архитектура v2
- [docs/RELEASING.md](docs/RELEASING.md) — процесс релизов
- [docs/VERSIONS.md](docs/VERSIONS.md) — журнал коммитов
- [CHANGELOG.md](CHANGELOG.md) — человекочитаемый ченджлог

---

## 2. Как работать с кодом

### 2.1. Общие правила
- **НЕ коммитить без явной команды пользователя.** Перед коммитом: `git status`, `git diff`, осмысленный commit message.
- **НЕ пушить без явной команды пользователя.** Пуш — только после подтверждения.
- **НЕ добавлять комментарии в код без явной просьбы.**
- **Следовать существующему стилю кода** (именование, форматирование, структура импортов, хуки/компоненты).
- **НЕ изобретать библиотеки.** Использовать только те, что уже есть в `package.json`/`requirements.txt`.

### 2.2. Frontend (perum-web)
- **Фреймворк:** Next.js 16 (App Router), React 19, TypeScript 5 (strict mode).
- **Стили:** CSS Modules (`*.module.css`). CSS-переменные темы в `:root` (глобальные стили).
- **Графики:** `chart.js@4.5.1` + `react-chartjs-2@5.3.1`. Плагин: `chartjs-plugin-annotation@3.1.0` — для reference-lines.
- **Состояние:** `@tanstack/react-query@5` для серверного состояния.
- **Путь к странице ученика (успеваемость):** `perum-web/src/app/student/schedule/` — компонент `AnalyticsDashboard.tsx` в `_components/`.
- **Путь к API-клиенту:** `perum-web/src/lib/apiClient.ts`.
- **Типы:** `perum-web/src/types/index.ts`.

### 2.3. Backend (perum-core / perum-tenant)
- **Фреймворк:** FastAPI, SQLAlchemy 2.0 (async), asyncpg, Alembic.
- **Структура модуля:** `app/modules/<name>/` — `router.py` (роуты), `service.py` (бизнес-логика), `models.py` (SQLAlchemy), `schemas.py` (Pydantic).
- **Миграции:** Alembic в `app/migrations/versions/`.
- **Тесты:** `tests/` (pytest + aiosqlite для tenant-юнитов).

---

## 3. Проверки и форматтеры

### 3.1. Frontend (`perum-web/`)
```bash
# TypeScript typecheck (обязательно перед коммитом)
cd perum-web && npx tsc --noEmit

# Сборка (полная проверка включая типы)
cd perum-web && npx next build

# ESLint (Next.js 16: встроенный линтер через next lint)
# Примечание: eslint v9 + .eslintrc.json могут конфликтовать.
# Основная проверка — tsc --noEmit.
cd perum-web && npm run lint   # = next lint
```

### 3.2. Backend
```bash
# perum-core — все тесты
cd perum-core && python -m pytest -q

# perum-tenant — unit-тесты
cd perum-tenant && python -m pytest tests/unit -q
```

### 3.3. CI (GitHub Actions)
- **`.github/workflows/ci.yml`** — на push/PR в `main`: core pytest, tenant pytest (unit), web `tsc --noEmit`.
- **`.github/workflows/release.yml`** — на push в `main`: paths-filter, сборка Docker-образов, push в GHCR, авто-регистрация релиза.

---

## 4. Версионирование и ченджлог

### 4.1. Версионирование
- Формат версий: `0.0.x` (ранняя стадия).
- **CHANGELOG.md** — Keep a Changelog, свежие версии сверху. Секция `## [Unreleased] — ГГГГ-ММ-ДД` для ещё не выпущенного.
- **docs/VERSIONS.md** — счётчик коммитов `№(N)`. Каждый новый коммит → новая строка: `| N | дата время | хеш | описание |`.
- **perum-web/package.json** — поле `version` для frontend-пакета (сейчас `2.0.0`).

### 4.2. Правила обновления ченджлога
После каждого цикла изменений:
1. Добавить запись в `CHANGELOG.md` в секцию `[Unreleased]` с текущей датой (если секции с такой датой нет — создать новую).
2. Добавить строку в таблицу коммитов в `docs/VERSIONS.md` (хеш можно указать `_______` до коммита, затем обновить).

---

## 5. Коммиты

### 5.1. Формат сообщений (Conventional Commits)
```
<type>(<scope>): <краткое описание>

<подробное тело (опционально)>
```
Типы: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `perf`.

Примеры:
- `feat(web): улучшена диаграмма среднего балла по предметам`
- `fix(audit): закрыта утечка данных через org_admin`
- `docs: обновлён AGENTS.md`

### 5.2. Процесс коммита
```bash
git status                    # посмотреть что изменилось
git diff                      # проверить дифф
git add <files>               # staged только нужные файлы
git commit -m "..."           # осмысленное сообщение
git push                      # только по явной команде
```

---

## 6. Сводка после каждого цикла изменений (Post-Mortem)

**После каждого цикла внесения изменений** (перед коммитом) агент обязан сформировать краткую сводку в формате:

```
## Сводка изменений

### Проблема
<что требовалось исправить/улучшить, контекст>

### Симптомы
<как проблема проявлялась — конкретные наблюдаемые признаки>

### Причина (root cause)
<первопричина — почему проблема возникла, что было упущено>

### Решение
<что именно сделано, какие файлы затронуты>

### Почему это решение надёжно
<обоснование — почему именно этот подход выбран, какие альтернативы рассмотрены и отвергнуты, почему решение гарантированно исправляет проблему>

### Проверки
- [ ] `tsc --noEmit` (web)
- [ ] `next build` (web)
- [ ] `python -m pytest` (core/tenant — если затронуты)
- [ ] CHANGELOG.md обновлён
- [ ] VERSIONS.md обновлён
```

---

## 7. Прод-сервер

| Параметр | Значение |
|----------|----------|
| **IP** | `87.232.119.17` |
| **Пользователь** | `root` |
| **Пароль / ключ** | `cGC72q9UZg2lC83` |
| **Подключение** | `ssh root@87.232.119.17` |
| **Путь на сервере** | `/opt/perum` (проверить при деплое) |

Для деплоя использовать скрипты из `deploy/` (Caddyfile, docker-compose, .env.prod).
**Никогда не коммитить секреты и пароли в репозиторий.**
