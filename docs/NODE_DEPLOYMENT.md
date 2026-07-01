# Развёртывание ноды PERUM

> Последнее обновление: 2026-06-18

---

## Обзор

Нода — это сервер, на котором крутятся школы организации. Развёртывание ноды выполняется техническим специалистом через скачиваемый bootstrap-скрипт.

---

## Требования к серверу

### Минимальные

| Параметр | Значение |
|----------|----------|
| OS | Ubuntu 22.04 LTS |
| CPU | 2 cores |
| RAM | 2 GB |
| Disk | 20 GB SSD |
| Network | Публичный IP, порты 80, 443 открыты |

### Рекомендуемые

| Параметр | Значение |
|----------|----------|
| OS | Ubuntu 22.04 LTS |
| CPU | 4+ cores |
| RAM | 4+ GB |
| Disk | 50+ GB SSD |
| Network | 100+ Mbps, стабильное соединение с ядром |

---

## Процесс развёртывания

### Шаг 1: Регистрация ноды в ядре

1. Зайти в аккаунт platform_admin: `https://admin.perum.ru`
2. Перейти в **Infrastructure** → **Add Node**
3. Заполнить форму:
   - **Name**: человекочитаемое имя (e.g., "node-01")
   - **Hostname**: IP-адрес или FQDN сервера
   - **CPU/RAM/Disk**: фактические ресурсы сервера
   - **Organization**: привязать к организации (или оставить "Pool")
   - **Max Schools**: максимальное кол-во школ

4. Нажать **Create Node**

### Шаг 2: Скачивание bootstrap-скрипта

1. В списке нод найти созданную ноду (статус `pending_bootstrap`)
2. Нажать **Download Bootstrap Script**
3. Сохранить файл `perum-node-<name>-bootstrap.sh`

**Скрипт содержит:**
- Одноразовый enrollment-токен (действителен 7 дней)
- URL ядра
- Slug организации
- Текущий release tag

### Шаг 3: Запуск скрипта на сервере

```bash
# Скопировать скрипт на целевой сервер
scp perum-node-<name>-bootstrap.sh root@<server-ip>:/root/

# Подключиться к серверу
ssh root@<server-ip>

# Запустить скрипт
bash perum-node-<name>-bootstrap.sh
```

**Скрипт выполнит:**
1. Проверку системы (OS, RAM)
2. Установку Docker CE + Compose v2
3. Настройку firewall (UFW: 22, 80, 443)
4. Создание `/opt/perum-node/`
5. Запись `docker-compose.yml` и `.env`
6. Pull образов из GHCR
7. Запуск стека (`docker compose up -d`)
8. Ожидание health-check агента
9. Enrollment handshake с ядром
10. Вывод статуса

### Шаг 4: Верификация

После успешного запуска:

```bash
# Проверить статус контейнеров
cd /opt/perum-node && docker compose ps

# Проверить health агента
curl http://127.0.0.1:3000/agent/health

# Проверить enrollment
curl http://127.0.0.1:3000/agent/whoami
```

В ядре (platform UI) нода должна появиться со статусом `active`.

---

## Troubleshooting

### Скрипт не запускается

**Проблема:** `Permission denied`

**Решение:**
```bash
chmod +x perum-node-<name>-bootstrap.sh
# или запустить через bash
bash perum-node-<name>-bootstrap.sh
```

### Docker не устанавливается

**Проблема:** `apt-get update fails`

**Решение:**
```bash
# Проверить интернет-соединение
ping -c 3 download.docker.com

# Проверить DNS
cat /etc/resolv.conf
```

### Агент не подключается к ядру

**Проблема:** `Enrollment failed`

**Причины:**
1. Enrollment-токен истёк (> 7 дней)
2. Ядро недоступно с ноды
3. Токен уже использован

**Решение:**
```bash
# Проверить доступность ядра
curl -v <CORE_URL>/api/health

# Сгенерировать новый токен в ядре и повторить
```

### Школы не провижинятся

**Проблема:** `provision_school failed`

**Проверка:**
```bash
# Логи агента
docker compose logs perum_agent

# Логи docker_proxy
docker compose logs docker_proxy

# Проверить Docker socket
ls -la /var/run/docker.sock
```

---

## Управление нодой

### Drain (вывод из эксплуатации)

Перевести ноду в `draining` — новые школы не назначаются, существующие мигрируют:

```bash
# Через API
curl -X POST https://admin.perum.ru/api/platform/nodes/<id>/drain \
  -H "Authorization: Bearer <token>"
```

### Удаление ноды

1. Убедиться, что на ноде нет школ (или мигрировать их)
2. Перевести в `draining`
3. Удалить через API или UI

### Обновление агента

Агент обновляется через OTA (см. [OTA_UPDATES.md](OTA_UPDATES.md)).

---

## Безопасность

### Enrollment-токен

- Одноразовый (используется один раз при enrollment)
- Действителен 7 дней
- Хранится в БД как SHA-256 hash
- Плейнтекст показывается только при генерации

### Docker socket

- Доступ только через `docker_proxy` (read-only, filtered API)
- Прямой mount `/var/run/docker.sock` запрещён

### Firewall

- UFW: открыты только 22 (SSH), 80 (HTTP), 443 (HTTPS)
- Порт агента (3000) привязан к `127.0.0.1`

---

## Связанные документы

- [INFRASTRUCTURE.md](INFRASTRUCTURE.md) — общая архитектура
- [OTA_UPDATES.md](OTA_UPDATES.md) — обновления
- [TARIFFS_AND_LIMITS.md](TARIFFS_AND_LIMITS.md) — тарифы
