# Тарифы и лимиты PERUM

> Последнее обновление: 2026-06-18

---

## Тарифные планы

| План | Школ | Кастомных доменов | Лендинги | Нод | Цена |
|------|------|-------------------|----------|-----|------|
| **Trial** | 1 | 0 | Нет | 1 | Бесплатно (14 дней) |
| **Basic** | 5 | 1 | Нет | 1 | 2 900 ₽/мес |
| **Pro** | 50 | 5 | Да | 3 | 9 900 ₽/мес |
| **Enterprise** | 1000 | 20 | Да | 10 | 49 900 ₽/мес |

---

## Лимиты

### Школы

**Проверка:** при создании школы (`POST /api/schools`)

```python
# app/routers/schools.py
async def _enforce_school_limit(db, org_id):
    org = await db.get(Organization, org_id)
    plan_limit = school_limit(org.plan)  # из PLAN_SCHOOL_LIMITS
    org_limit = org.max_schools          # из таблицы organizations
    limit = min(plan_limit, org_limit)
    used = count(schools where status != 'archived')
    if used >= limit:
        raise HTTPException(402, "достигнут лимит школ")
```

**Обход лимита:**
- Повысить план (`PUT /api/organizations/{slug}/billing`)
- Увеличить `max_schools` вручную (platform admin)
- Архивировать неиспользуемые школы

### Кастомные домены

**Проверка:** при добавлении домена (`POST /api/schools/{id}/domains`)

```python
# app/routers/schools.py
custom_domains_count = count(domains where type='custom' and status!='removed')
if custom_domains_count >= org.max_custom_domains:
    raise HTTPException(402, "достигнут лимит кастомных доменов")
```

**Поддомены** (e.g., `school1.perum.ru`) не лимитируются — только кастомные домены.

### Лендинги

**Проверка:** `org.custom_landing_enabled`

Если `False` — школа не может иметь кастомный HTML-лендинг на своём домене.

### Ноды

**Проверка:** при регистрации ноды (`POST /api/platform/nodes`)

```python
nodes_count = count(nodes where org_id=org.id and status!='decommissioned')
if nodes_count >= org.max_nodes:
    raise HTTPException(402, "достигнут лимит нод")
```

---

## Billing Enforcement

### Автоматическая заморозка

**Фоновый процесс** (`_billing_enforcement_loop` в `main.py`):
- Запускается каждые `BILLING_ENFORCE_INTERVAL_S` (default: 3600s)
- Проверяет все `active` организации
- Если подписка просрочена (> 3 дня grace period):
  1. Создаёт открытый счёт (`Invoice` со status=`open`)
  2. Замораживает все школы организации
  3. Замораживает саму организацию (status=`suspended`)

### Разморозка

**Автоматическая:** при оплате (`POST /api/organizations/{slug}/billing/charge`)
- Если организация была `suspended` и подписка теперь активна
- Автоматически размораживаются школы с `suspended_by='org'`
- Школы с `suspended_by='manual'` остаются замороженными

**Ручная:** platform admin через UI или API

---

## API Reference

### Проверка лимитов

```bash
# Лимиты организации (platform admin)
GET /api/organizations/{slug}/billing

# Ответ:
{
  "org_slug": "acme",
  "plan": "pro",
  "price_rub_month": 9900,
  "school_limit": 50,
  "schools_used": 12,
  "schools_remaining": 38,
  "subscription": {
    "status": "active",
    "paid_until": "2026-12-31T00:00:00",
    "days_left": 196,
    "delinquent": false
  }
}
```

### Смена плана

```bash
# Повысить план
PUT /api/organizations/{slug}/billing
{
  "plan": "enterprise"
}

# Понизить план (если used <= new_limit)
PUT /api/organizations/{slug}/billing
{
  "plan": "basic"
}

# Понизить принудительно (если used > new_limit)
PUT /api/organizations/{slug}/billing?force=true
{
  "plan": "basic"
}
```

### Оплата

```bash
# Отметить оплату (продлить подписку)
POST /api/organizations/{slug}/billing/charge
{
  "months": 1
}
```

---

## Модель данных

### Organization (расширенная)

| Поле | Тип | Default | Описание |
|------|-----|---------|----------|
| `plan` | String | `"trial"` | План из `PLANS` |
| `plan_tier` | String | `"starter"` | Алиас (free/starter/pro/enterprise) |
| `max_schools` | Integer | 5 | Макс. школ (override) |
| `max_custom_domains` | Integer | 1 | Макс. кастомных доменов |
| `custom_landing_enabled` | Boolean | False | Разрешены ли лендинги |
| `max_nodes` | Integer | 1 | Макс. нод |

### Subscription

| Поле | Тип | Описание |
|------|-----|----------|
| `org_id` | FK | Организация |
| `status` | Enum | `trial`, `active`, `past_due`, `canceled` |
| `trial_ends_at` | DateTime | Конец триала |
| `paid_until` | DateTime | Оплачено до |

### Invoice

| Поле | Тип | Описание |
|------|-----|----------|
| `org_id` | FK | Организация |
| `plan` | String | План на момент оплаты |
| `amount_rub` | Integer | Сумма |
| `status` | Enum | `open`, `paid`, `void` |
| `provider` | String | `manual` или `yookassa` |
| `provider_ref` | String | ID платежа у провайдера |

---

## Связанные документы

- [INFRASTRUCTURE.md](INFRASTRUCTURE.md) — инфраструктура
- [DOMAINS.md](DOMAINS.md) — управление доменами
- [BILLING.md](BILLING.md) — детали биллинга (если есть)
