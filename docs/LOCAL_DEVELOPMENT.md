# Локальная разработка

## Требования

- Python 3.12;
- Node.js 20 для web/shared checks; mobile CI использует Node.js 22.13;
- npm с корневым `package-lock.json`;
- Docker Compose для полного локального стека.

## JavaScript workspace

Из корня репозитория:

```bash
npm ci
npm run dev --workspace perum-web
npm run start --workspace perum-mobile
```

Web использует Next.js dev server, по умолчанию порт 3000. Mobile использует Expo
CLI из workspace. Эти процессы запускаются в отдельных terminals.

## Backend

Создайте отдельное virtual environment для каждого backend и установите
requirements из соответствующего каталога:

```bash
python -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --reload --port <unique-port>
```

Команда выполняется отдельно в `perum-core/` и `perum-tenant/`; Core, Tenant и Web
должны слушать разные ports. Полный discovery/login flow дополнительно требует
локальные domains/routing и согласованные public URLs, поэтому для end-to-end
работы предпочтителен Compose. Локальные настройки задаются environment variables
из `app/core/config.py`; production значения не копируются в репозиторий.

## Compose

Для локального control-plane стека из корня:

```bash
docker compose -f deploy/docker-compose.core.yml up -d --build
```

Dev defaults предназначены только для локальной среды. Перед использованием
production override следуйте [RUNBOOK.md](RUNBOOK.md).
