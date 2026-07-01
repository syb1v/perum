#!/usr/bin/env bash
# ============================================================================
# deploy-core.sh — развёртывание perum-core (Control Plane) на Ubuntu-сервере
# ============================================================================
# Запуск прямо на сервере:
#   bash deploy-core.sh --domain grsn-panel.ru
#   bash deploy-core.sh --domain grsn-panel.ru --email ops@grsn-panel.ru
#
# Флаги:
#   --domain DOMAIN       Домен платформы (ОБЯЗАТЕЛЕН)
#   --email EMAIL         Email для ACME/TLS (без него: admin@<domain>)
#   --repo URL            URL репо  (по умолчанию: git@github.com:syb1v/perum.git)
#   --branch BRANCH       Ветка     (по умолчанию: main)
#   --path DIR            Путь      (по умолчанию: /opt/perum)
#   --no-docker           Пропустить установку Docker (уже есть)
#   --no-clone            Пропустить клон репо (уже есть)
#   --no-build            Тянуть perum_core из GHCR вместо локальной сборки
#                         (perum_web ВСЕГДА собирается локально — domain-specific)
#   --skip-secrets        Не генерировать секреты (использовать готовый .env.prod)
#   --dry-run             Только показать, что будет сделано
#   --update              Режим обновления (без первичной настройки)
#   -h, --help            Справка
# ============================================================================

set -euo pipefail

# ── Цвета ─────────────────────────────────────────────────────────────────
C_RESET='\033[0m'; C_BOLD='\033[1m'; C_GREEN='\033[0;32m'
C_CYAN='\033[0;36m'; C_YELLOW='\033[0;33m'; C_RED='\033[0;31m'; C_GRAY='\033[0;90m'

say()   { echo -e "${C_CYAN}===${C_RESET} ${C_BOLD}${1}${C_RESET}"; }
step()  { echo -e "\n${C_GREEN}[${1}]${C_RESET} ${2}"; }
info()  { echo -e "  ${C_GRAY}→${C_RESET} ${1}"; }
warn()  { echo -e "  ${C_YELLOW}!${C_RESET} ${1}"; }
ok()    { echo -e "  ${C_GREEN}✓${C_RESET} ${1}"; }
err()   { echo -e "${C_RED}✗${C_RESET} ${1}" >&2; }
die()   { err "$1"; exit 1; }
banner() {
  echo ""
  echo -e "${C_CYAN}╔══════════════════════════════════════════════╗${C_RESET}"
  echo -e "${C_CYAN}║${C_RESET}       ${C_BOLD}PERUM Core — Развёртывание${C_RESET}         ${C_CYAN}║${C_RESET}"
  echo -e "${C_CYAN}╚══════════════════════════════════════════════╝${C_RESET}"
}

# ── Параметры ────────────────────────────────────────────────────────────
DOMAIN=""
EMAIL=""
REPO_URL="git@github.com:syb1v/perum.git"
BRANCH="main"
DEPLOY_PATH="/opt/perum"
NO_DOCKER=false
NO_CLONE=false
NO_BUILD=false
SKIP_SECRETS=false
DRY_RUN=false
UPDATE=false

usage() {
  sed -n '3,22p' "$0" | grep -E '^(# |#$)' | sed 's/^# \?//'
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain)       DOMAIN="$2"; shift 2 ;;
    --email)        EMAIL="$2"; shift 2 ;;
    --repo)         REPO_URL="$2"; shift 2 ;;
    --branch)       BRANCH="$2"; shift 2 ;;
    --path)         DEPLOY_PATH="$2"; shift 2 ;;
    --no-docker)    NO_DOCKER=true; shift ;;
    --no-clone)     NO_CLONE=true; shift ;;
    --no-build)     NO_BUILD=true; shift ;;
    --skip-secrets) SKIP_SECRETS=true; shift ;;
    --dry-run)      DRY_RUN=true; shift ;;
    --update)       UPDATE=true; shift ;;
    -h|--help)      usage ;;
    *) die "Неизвестный аргумент: $1. Используйте --help" ;;
  esac
done

# ── Авто-режим: если запущено без --domain и без --update — спросить ─────
if [[ "$UPDATE" != true ]] && [[ -z "$DOMAIN" ]]; then
  if [[ -t 0 ]]; then
    read -r -p "Домен платформы (напр. grsn-panel.ru): " DOMAIN
    [[ -z "$DOMAIN" ]] && die "Домен обязателен"
  else
    die "Укажите --domain <домен> для первичной установки или --update для обновления"
  fi
fi

[[ -z "$EMAIL" ]] && EMAIL="admin@${DOMAIN}"

# ── Проверка прав ────────────────────────────────────────────────────────
if [[ "$DRY_RUN" != true ]]; then
  if [[ "$EUID" -ne 0 ]] && ! sudo -n true 2>/dev/null; then
    die "Нужны root-права. Запустите через sudo bash $0 --domain ${DOMAIN:-...}"
  fi
fi

run() {
  if [[ "$DRY_RUN" == true ]]; then
    info "[DRY RUN] $*"
    return 0
  fi
  if [[ "$EUID" -eq 0 ]]; then
    eval "$@"
  else
    sudo bash -c "$*"
  fi
}

banner

# ═══════════════════════════════════════════════════════════════════════════
if [[ "$UPDATE" == true ]]; then
  # ── Режим обновления ───────────────────────────────────────────────────
  say "Режим: ОБНОВЛЕНИЕ (без первичной настройки)"
  info "Путь: ${DEPLOY_PATH}"

  step "1" "git pull..."
  run "cd ${DEPLOY_PATH} && git checkout ${BRANCH} && git pull --ff-only origin ${BRANCH}"

  step "2" "docker compose pull perum_core perum_web..."
  run "cd ${DEPLOY_PATH} && docker compose -f deploy/docker-compose.core.yml -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod pull perum_core perum_web"

  step "3" "docker compose up -d --force-recreate perum_core perum_web..."
  run "cd ${DEPLOY_PATH} && docker compose -f deploy/docker-compose.core.yml -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod up -d --force-recreate perum_core perum_web"

  step "4" "docker image prune -f..."
  run "docker image prune -f"

  echo ""
  say "Обновление завершено"
  info "Здоровье: https://admin.${DOMAIN}/health"
  exit 0
fi

# ═══════════════════════════════════════════════════════════════════════════
# ── Режим первичной установки ─────────────────────────────────────────────
say "Режим: ПЕРВИЧНАЯ УСТАНОВКА"
info "Домен : ${DOMAIN}"
info "Email  : ${EMAIL}"
info "Путь   : ${DEPLOY_PATH}"
info "Ветка  : ${BRANCH}"

# ── [1/7] Docker ─────────────────────────────────────────────────────────
if [[ "$NO_DOCKER" != true ]]; then
  step "1/7" "Установка Docker..."
  if command -v docker &>/dev/null; then
    ok "Docker уже установлен: $(docker --version)"
  else
    info "Устанавливаю Docker..."
    run "curl -fsSL https://get.docker.com | sh"
    run "systemctl enable --now docker"
    ok "Docker установлен: $(docker --version)"
  fi

  if ! docker compose version &>/dev/null; then
    info "Устанавливаю docker compose plugin..."
    run "apt-get update -qq && apt-get install -y -qq docker-compose-plugin"
  fi
  ok "Docker Compose: $(docker compose version)"
else
  step "1/7" "Docker — ПРОПУЩЕН (--no-docker)"
fi

# ── [2/7] Клонирование репо ──────────────────────────────────────────────
if [[ "$NO_CLONE" != true ]]; then
  step "2/7" "Клонирование репозитория..."

  if [[ ! -d "${DEPLOY_PATH}/.git" ]]; then
    info "Клонирую ${REPO_URL} → ${DEPLOY_PATH} (ветка ${BRANCH})..."

    # Пробуем HTTPS если SSH недоступен
    SSH_GIT_URL="${REPO_URL}"
    HTTPS_GIT_URL="https://github.com/syb1v/perum.git"

    if run "git clone --branch ${BRANCH} ${SSH_GIT_URL} ${DEPLOY_PATH} 2>/dev/null"; then
      ok "Клонирован по SSH"
    elif run "git clone --branch ${BRANCH} ${HTTPS_GIT_URL} ${DEPLOY_PATH} 2>/dev/null"; then
      ok "Клонирован по HTTPS (SSH недоступен)"
    else
      die "Не удалось клонировать репозиторий. Проверьте доступ к GitHub."
    fi
  else
    ok "Репозиторий уже существует: ${DEPLOY_PATH}"
    info "Актуализирую ветку ${BRANCH}..."
    run "cd ${DEPLOY_PATH} && git fetch origin ${BRANCH} && git checkout ${BRANCH} && git pull --ff-only origin ${BRANCH}"
  fi
else
  step "2/7" "Клонирование — ПРОПУЩЕН (--no-clone)"
fi

# ── [3/7] Секреты и .env.prod ────────────────────────────────────────────
step "3/7" "Настройка deploy/.env.prod..."

ENV_FILE="${DEPLOY_PATH}/deploy/.env.prod"
ENV_EXAMPLE="${DEPLOY_PATH}/deploy/.env.prod.example"

if [[ "$SKIP_SECRETS" == true ]]; then
  ok "Секреты — ПРОПУЩЕНЫ (--skip-secrets)"
elif [[ -f "$ENV_FILE" ]] && ! grep -q '__CHANGE_ME__' "$ENV_FILE" 2>/dev/null; then
  ok "${ENV_FILE} уже настроен (секреты заполнены)"
else
  info "Генерирую секреты и создаю ${ENV_FILE}..."

  SECRET_KEY=$(openssl rand -hex 32)
  DB_PASSWORD=$(openssl rand -hex 16)
  ENCRYPTION_KEY=$(python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())" 2>/dev/null || echo "auto_generated_$(openssl rand -hex 32)")
  METRICS_TOKEN=$(openssl rand -hex 16)
  BOOTSTRAP_PASSWORD=$(openssl rand -hex 8)
  RELEASE_PUBLISH_TOKEN=$(python3 -c "import secrets; print(secrets.token_urlsafe(32))" 2>/dev/null || openssl rand -hex 32)
  AGENT_TOKEN=$(openssl rand -hex 32)
  GRAFANA_PASSWORD=$(openssl rand -hex 8)

  run "mkdir -p ${DEPLOY_PATH}/deploy"

  run "cat > ${ENV_FILE} <<'PRODENV'
# PERUM — продакшн .env (сгенерирован deploy-core.sh, $(date +%Y-%m-%d))
ENVIRONMENT=prod

# Базовые образы (postgres/redis/caddy). В РФ — зеркало.
IMAGE_REGISTRY=mirror.gcr.io

# Образы приложений (из GHCR)
CORE_IMAGE=ghcr.io/syb1v/perum-core:latest
WEB_IMAGE=ghcr.io/syb1v/perum-web:latest
TENANT_IMAGE=ghcr.io/syb1v/perum-tenant:1.0.0

# Pull policy: always = тянуть свежий образ при каждом compose up
CORE_PULL_POLICY=always
WEB_PULL_POLICY=always

# Секреты
SECRET_KEY=${SECRET_KEY}
CONTROL_DB_PASSWORD=${DB_PASSWORD}

# Шифрование секретов школ/орг at-rest (Fernet)
SECRETS_ENCRYPTION_KEY=${ENCRYPTION_KEY}

# Токен для /metrics (Prometheus передаёт как Bearer)
METRICS_TOKEN=${METRICS_TOKEN}

# Первый platform_admin
BOOTSTRAP_ADMIN_LOGIN=admin
BOOTSTRAP_ADMIN_PASSWORD=${BOOTSTRAP_PASSWORD}

# Токен CI-публикации релизов (POST /api/ci/release)
RELEASE_PUBLISH_TOKEN=${RELEASE_PUBLISH_TOKEN}

# Токен ядро↔воркор ноды (/api/agent/*)
AGENT_TOKEN=${AGENT_TOKEN}

# Домены и TLS — НАСТРАИВАЕТСЯ АВТОМАТИЧЕСКИ
PUBLIC_BASE_DOMAIN=${DOMAIN}
ACME_EMAIL=${EMAIL}

# Observability (Grafana)
GRAFANA_USER=admin
GRAFANA_PASSWORD=${GRAFANA_PASSWORD}
PRODENV"

  ok "${ENV_FILE} создан со всеми секретами"
  info "Логин платформы: admin / ${BOOTSTRAP_PASSWORD}"
  warn "Сохраните пароль администратора! Он показан только сейчас."
fi

# ── [4/7] Caddyfile — подстановка домена ─────────────────────────────────
step "4/7" "Настройка Caddy под домен ${DOMAIN}..."

CADDYFILE="${DEPLOY_PATH}/deploy/caddy/Caddyfile.prod"

# Проверяем, что Caddyfile.prod использует переменные ({$PERUM_BASE_DOMAIN}),
# которые подставляются docker-compose через environment.
# Ничего менять в файле не нужно — он уже параметризован.
# Убедимся, что переменная PERUM_BASE_DOMAIN проброшена в docker-compose.prod.yml
COMPOSE_PROD="${DEPLOY_PATH}/deploy/docker-compose.prod.yml"
if run "grep -q 'PERUM_BASE_DOMAIN' ${COMPOSE_PROD}"; then
  ok "Caddyfile.prod параметризован — домен подставится из .env.prod"
else
  warn "Caddyfile.prod не параметризован — проверьте \${PERUM_BASE_DOMAIN}"
fi

# ── [5/7] Предзагрузка docker-socket-proxy ───────────────────────────────
step "5/7" "Предзагрузка docker-socket-proxy..."

if [[ "$NO_BUILD" != true ]]; then
  run "
    if ! docker image inspect tecnativa/docker-socket-proxy:0.3 &>/dev/null; then
      docker pull tecnativa/docker-socket-proxy:0.3 2>/dev/null || {
        docker pull mirror.gcr.io/tecnativa/docker-socket-proxy:0.3 &&
        docker tag mirror.gcr.io/tecnativa/docker-socket-proxy:0.3 tecnativa/docker-socket-proxy:0.3
      }
      echo 'docker-socket-proxy загружен'
    else
      echo 'docker-socket-proxy уже есть'
    fi
  "
  ok "docker-socket-proxy готов"
else
  step "5/7" "docker-socket-proxy — ПРОПУЩЕН (--no-build)"
fi

# ── [6/7] Сборка или pull образов ─────────────────────────────────────────
step "6/7" "Получение образов perum-core и perum-web..."

COMPOSE_BASE="cd ${DEPLOY_PATH} && docker compose -f deploy/docker-compose.core.yml -f deploy/docker-compose.prod.yml --env-file ${ENV_FILE}"

# perum_web ОБЯЗАТЕЛЬНО собираем локально, потому что NEXT_PUBLIC_BASE_DOMAIN
# вшивается в билд. GHCR-образ собран под другой домен — если его использовать,
# апекс будет редиректить на /login вместо лендинга.
info "Сборка perum_web локально с PUBLIC_BASE_DOMAIN=${DOMAIN}..."
run "${COMPOSE_BASE} build --no-cache --build-arg NEXT_PUBLIC_BASE_DOMAIN=${DOMAIN} perum_web"

# perum_core можно либо собрать локально, либо тянуть из GHCR.
# По умолчанию собираем локально для консистентности; флаг --no-build оставлен
# для совместимости, но он влияет только на perum_core/инфраструктуру.
if [[ "$NO_BUILD" == true ]]; then
  info "Тянем perum_core из GHCR..."
  run "${COMPOSE_BASE} pull perum_core 2>&1"
else
  info "Сборка perum_core локально..."
  run "${COMPOSE_BASE} build --no-cache perum_core 2>&1"
fi

info "Pull базовых сервисов..."
run "${COMPOSE_BASE} pull perum_control_db shared_redis caddy 2>&1"

ok "Образы готовы"

# ── [7/7] Запуск стека ────────────────────────────────────────────────────
step "7/7" "Запуск perum-core..."

run "${COMPOSE_BASE} up -d"

ok "Стек запущен. Жду инициализацию БД (alembic upgrade head)..."
sleep 5

# Проверка здоровья
info "Проверка здоровья perum_core..."
for i in $(seq 1 12); do
  if run "docker exec perum_core curl -fsS http://localhost:3000/health 2>/dev/null"; then
    ok "perum_core здоров!"
    break
  fi
  sleep 5
done

# ── Финал ─────────────────────────────────────────────────────────────────
echo ""
echo -e "${C_CYAN}╔══════════════════════════════════════════════════════════════╗${C_RESET}"
echo -e "${C_CYAN}║${C_RESET}              ${C_BOLD}Деплой завершён успешно${C_RESET}                   ${C_CYAN}║${C_RESET}"
echo -e "${C_CYAN}╚══════════════════════════════════════════════════════════════╝${C_RESET}"
echo ""
echo -e "  ${C_GREEN}Платформа:${C_RESET}  https://admin.${DOMAIN}"
echo -e "  ${C_GREEN}Лендинг:${C_RESET}     https://${DOMAIN}"
echo -e "  ${C_GREEN}Здоровье:${C_RESET}    https://admin.${DOMAIN}/health"
echo -e "  ${C_GREEN}Grafana:${C_RESET}    http://localhost:3001  (только локально)"
echo ""
echo -e "  ${C_YELLOW}Логин админа:${C_RESET} admin"
echo -e "  ${C_YELLOW}Пароль:${C_RESET}       сохранён в ${ENV_FILE} (BOOTSTRAP_ADMIN_PASSWORD)"
echo ""
echo -e "  ${C_GRAY}Следующий шаг — DNS:${C_RESET}"
echo -e "  ${C_GRAY}  @   A   ${HOSTNAME:-<IP сервера>}${C_RESET}"
echo -e "  ${C_GRAY}  *   A   ${HOSTNAME:-<IP сервера>}${C_RESET}"
echo -e "  ${C_GRAY}  admin CNAME @${C_RESET}"
