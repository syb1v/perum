# Domains: доменная идентичность орг и школ

> Документ описывает актуальную (с 2026-06-22) модель доменной идентичности ПЭРУМ.
> Предыдущая модель (slug → `<slug>.<base>`) устарела и заменена описанной здесь.

## Концепция

| Сущность | Идентичность | Где живёт стек |
|---|---|---|
| Организация | Корневой домен (`acme.ru`) | Лендинг-контейнер на ноде |
| Школа | Поддомен домена орг (`gym5.acme.ru`) | Школьный стек на ноде |

**Ядро — тонкий реестр.** Хранит метаданные (домен орг → нода, поддомен школы, авторизацию org_admin, биллинг). Сами стеки (лендинг орг и школы) разворачиваются и работают на нодах — воркор ноды (`ROLE=org_agent`) поднимает контейнеры и правит Caddy ноды через admin API.

**DNS — ручная настройка.** Оператор создаёт у регистратора:

| Запись | Тип | Значение |
|---|---|---|
| `@` (корень домена) | A или CNAME | IP / hostname ноды |
| `*` (wildcard) | A или CNAME | IP / hostname ноды |

После распространения DNS (5–60 мин) node Caddy выпускает TLS-сертификаты автоматически (on-demand).

## Создание организации

`POST /api/organizations` принимает:

```json
{
  "domain": "acme.ru",
  "node_id": 3,
  "name": "Acme Education",
  "admin_email": "admin@acme.ru",
  "plan": "trial"
}
```

Ядро:
1. Проверяет уникальность домена.
2. Проверяет, что нода активна.
3. Выводит внутренний `slug = slug_from_domain(domain)` (инфра-токен, не показывается наружу).
4. Создаёт запись орг, подписку и org_admin.
5. Просит воркор ноды `POST /api/agent/landing/provision` поднять лендинг.
6. Ставит `landing_status = "active" | "failed"`.

Ответ содержит объект `OrganizationRead` (с `domain`, `landing_status`) и одноразовые credentials org_admin.

## Лендинг организации на ноде

Воркор (`provision_landing_on_node`):
1. Пуллит `nginx:alpine`.
2. Создаёт контейнер `landing_{slug}` с `index.html` (имя орг + список школ).
3. Добавляет в Caddy ноды proxy-маршрут: `{domain}` → `landing_{slug}:80` (все пути).

`deprovision_landing_on_node` удаляет контейнер и маршрут по label-slug.

При **репровижининге** (`POST /api/organizations/{id}/reprovision`) лендинг пересоздаётся с актуальным списком школ.

## Создание школы

`POST /api/schools` (org_admin) принимает:

```json
{
  "subdomain": "gym5",
  "name": "Гимназия №5",
  "admin_email": "director@gym5.acme.ru"
}
```

Ядро:
1. Проверяет уникальность поддомена в рамках орг.
2. Создаёт запись `School(subdomain="gym5", slug="sch{id}")`.
3. Полный хост: `gym5.acme.ru`.

Воркор (`provision_school_orchestrated`) получает `host = "gym5.acme.ru"` и добавляет маршрут в Caddy ноды: `gym5.acme.ru/{api,websocket} → school_{id}_app:3000`.

## DNS-гайд в UI

**Платформа-консоль (`GET /api/organizations/{id}/dns`):**

```json
{
  "domain": "acme.ru",
  "node_name": "node-1",
  "dns_target": "150.241.87.91",
  "record_type": "A",
  "records": [
    {"name": "@", "type": "A", "value": "150.241.87.91", "purpose": "корневой домен → лендинг орг"},
    {"name": "*", "type": "A", "value": "150.241.87.91", "purpose": "wildcard → все школы (поддомены)"}
  ]
}
```

Кнопка **DNS** у каждой орг в таблице открывает модалку с этими записями.

**Кабинет орг (`GET /api/schools/{id}/dns`):** возвращает `full_host` (`gym5.acme.ru`), `dns_target` (нода), `record_type`. Модалка «Домены» у школы показывает DNS-инструкцию.

## Внутренние имена (инфра-токены)

| Объект | Шаблон | Пример |
|---|---|---|
| Slug орг | `slug_from_domain(domain)` | `acme-ru` |
| Лендинг-контейнер | `landing_{slug}` | `landing_acme-ru` |
| Caddy-маршрут лендинга | `lnd-{slug}` | `lnd-acme-ru` |
| Slug школы | `sch{school.id}` | `sch42` |
| Контейнер школы | `school_{slug}_app` | `school_sch42_app` |
| Caddy-маршрут школы | `sch-{slug}` | `sch-sch42` |

`slug` никогда не показывается в UI — это внутренний инфра-токен. Наружу орг = домен, школа = поддомен.

## Тарифные лимиты кастомных доменов школ

| План | Кастомных доменов школы |
|------|------------------------|
| Trial | 0 |
| Basic | 1 |
| Pro | 5 |
| Enterprise | 20 |

Кастомные домены школ (`POST /api/schools/{id}/domains`) — дополнительные домены поверх поддомена. Лимит проверяется полем `organizations.max_custom_domains`.

## Безопасность

- Уникальность домена орг — на уровне БД (`UNIQUE` constraint на `organizations.domain`).
- Уникальность поддомена школы — в рамках орг (`UNIQUE(org_id, subdomain)` де-факто, проверяется перед созданием).
- Slug школы `sch{id}` — глобально уникален по PK; исключает конфликты имён контейнеров при одинаковых поддоменах в разных орг на одной ноде.
- Воркор принимает запросы только с валидным `AGENT_TOKEN` (Bearer).
- DNS не валидируется ядром — ответственность оператора. TLS выпускается node Caddy (on-demand + Let's Encrypt) только после реального A/CNAME.
