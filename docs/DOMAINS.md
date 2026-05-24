# Domains: поддомены и кастомные домены

> Документ описывает, как организация получает свой URL — поддомен `<org>.perum.ru` или кастомный домен (`kuban-edu.ru`, `school45.ru`, и т.п.). Реализация — `deploy/caddy/Caddyfile.tmpl` + `perum-core/app/services/caddy_admin.py` + endpoint `perum-core/app/routers/domains.py`.

## Поддомен `<org_slug>.perum.ru` (по умолчанию)

При создании организации (см. [PROVISIONING.md](PROVISIONING.md)) автоматически назначается `<org_slug>.perum.ru`. Это работает прозрачно благодаря:

1. **DNS:** wildcard A-запись `*.perum.ru → IP_сервера` настроена один раз на регистраторе.
2. **TLS:** wildcard сертификат `*.perum.ru` через DNS-01 challenge. Caddy запрашивает его автоматически, использует API DNS-провайдера. Один cert покрывает все поддомены.
3. **Routing:** при провижининге control plane добавляет маршрут `<org_slug>.perum.ru → org_<slug>_app:3000` через Caddy admin API.

DNS-провайдер для wildcard выбирается из тех, что поддерживают [Caddy DNS providers](https://github.com/caddy-dns). Выбор зафиксирован в `.env`:

```
DNS_PROVIDER=yandex      # или cloudflare, route53, и т.д.
DNS_PROVIDER_TOKEN=...
```

Решение по конкретному провайдеру откладывается до Phase 1, когда будет настраиваться сервер.

## Кастомный домен

Орг может подключить свой домен (`kuban-edu.ru`, `school45.ru`). Это premium-фича — обычно идёт в платных планах. Поток:

### Шаг 1 — org_admin вводит домен

В org-admin UI на `https://<slug>.perum.ru/org-admin/domains`:

```
[ kuban-edu.ru ] [Подключить]
```

Запрос: `POST /api/org-admin/domains` с `{"domain": "kuban-edu.ru"}`. Tenant app пересылает в perum-core (`POST /internal/domains`) с `TELEMETRY_TOKEN`.

### Шаг 2 — control plane сохраняет домен в pending статусе

```sql
INSERT INTO organization_domains (org_id, domain, status, created_at)
VALUES (<org.id>, 'kuban-edu.ru', 'pending_dns', now());
```

UI org-admin показывает инструкцию:

> Создайте у вашего регистратора CNAME-запись:
> `kuban-edu.ru → caddy.perum.ru`
>
> Когда запись пропагируется (обычно 5-30 минут), мы автоматически выпустим SSL-сертификат и активируем домен.

### Шаг 3 — org_admin создаёт CNAME у регистратора

Это шаг на стороне клиента. UI периодически опрашивает control plane через `GET /api/org-admin/domains/<id>/status` и обновляет статус.

### Шаг 4 — первый запрос на новый домен

Когда CNAME пропагирован, любой запрос на `https://kuban-edu.ru/` попадает в Caddy. Caddy не имеет cert для этого домена — это первый запрос.

### Шаг 5 — Caddy спрашивает control plane

Перед попыткой выпустить Let's Encrypt cert, Caddy делает запрос:

```
GET https://admin.perum.ru/internal/validate-domain?domain=kuban-edu.ru
```

Этот endpoint (`perum-core/app/routers/domains.py::validate_domain`) проверяет:

```python
async def validate_domain(domain: str):
    row = await domains_repo.get_by_domain(domain)
    if not row:
        return Response(status_code=404)  # домена нет в БД, Caddy не выпустит cert
    if row.status not in ("pending_dns", "active"):
        return Response(status_code=403)
    # Опционально: проверка биллинга (план разрешает кастомный домен)
    org = await orgs_repo.get(row.org_id)
    if org.plan not in ALLOWED_CUSTOM_DOMAIN_PLANS:
        return Response(status_code=402)  # Payment Required
    return Response(status_code=200)
```

Если 200 → Caddy идёт за cert'ом.

### Шаг 6 — Caddy выпускает Let's Encrypt cert

Caddy использует HTTP-01 challenge (запрос идёт через тот же домен). Получает cert, кеширует на диске (`caddy_data` volume).

### Шаг 7 — Caddy просит upstream

После получения cert Caddy нужно понять, куда роутить `kuban-edu.ru`. Если в Caddyfile нет статической записи — control plane должен был добавить её через admin API после успешного `validate-domain`.

Это делается асинхронно после первого 200-ответа от `validate-domain`:

```python
async def validate_domain(domain: str):
    row = await domains_repo.get_by_domain(domain)
    if validation_passes(row):
        # Доабавить маршрут в Caddy
        await caddy_admin.add_route(
            host=domain,
            upstream=f"org_{row.org_slug}_app:3000"
        )
        # Обновить статус
        await domains_repo.mark_active(row.id)
        return Response(status_code=200)
```

После этого запрос на `kuban-edu.ru` роутится в `org_<slug>_app`.

### Шаг 8 — статус становится active

```sql
UPDATE organization_domains SET status = 'active', activated_at = now()
WHERE domain = 'kuban-edu.ru';
```

UI org-admin показывает «Домен активен».

## Удаление домена

`DELETE /api/org-admin/domains/<id>`:

1. Удаление маршрута в Caddy admin API.
2. `UPDATE organization_domains SET status = 'removed' WHERE id = ?` (не DELETE, для аудита).

Cert остаётся в кэше Caddy (не валит существующие соединения).

## Caddy конфигурация (шаблон)

`deploy/caddy/Caddyfile.tmpl`:

```caddy
{
    # Глобальный on-demand TLS для кастомных доменов
    on_demand_tls {
        ask https://admin.perum.ru/internal/validate-domain
        interval 2m
        burst 5
    }
    # admin API для control plane
    admin :2019
}

# Control plane
admin.perum.ru {
    reverse_proxy perum_core:3000
    encode gzip zstd
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "SAMEORIGIN"
    }
}

# Wildcard для *.perum.ru — DNS-01 challenge
*.perum.ru {
    tls {
        dns {env.DNS_PROVIDER} {env.DNS_PROVIDER_TOKEN}
    }
    # Маршруты внутрь добавляются control plane через admin API
    # Каждая орг получает route org_<slug>_app:3000 при провижининге
    # См. caddy_admin.add_route()
}

# Кастомные домены добавляются control plane через admin API
# Шаблон конкретного маршрута:
# kuban-edu.ru {
#     tls {
#         on_demand
#     }
#     reverse_proxy org_kuban_app:3000
# }
```

## Безопасность: защита от подмены домена

Угроза: злоумышленник создаёт у себя CNAME `evil.com → caddy.perum.ru` и при заходе на `evil.com` Caddy просит control plane подтвердить. Control plane проверяет:

1. **Домен зарегистрирован в БД.** Если `evil.com` не добавлен ни одной орг — 404.
2. **Биллинг ок.** Если орг не оплатила план с кастомным доменом — 402.

Без 1-го условия (домен в БД) — никто не может затащить чужой Caddy в выпуск cert'a на свой домен. Это базовая защита от abuse.

Дополнительно — rate limit на `validate-domain` endpoint (5 запросов в минуту с IP), чтобы не спалить квоту Let's Encrypt.

## Что появляется на каждой фазе

- **Phase 0:** документ.
- **Phase 1:** wildcard `*.perum.ru` через DNS-01, Caddy admin API, control plane умеет добавлять маршруты для поддоменов.
- **Phase 4:** custom domain flow целиком (включая on-demand TLS endpoint).
- **Phase 9:** валидация по биллинг-плану в `validate-domain`.
