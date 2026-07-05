#!/usr/bin/env bash
# ============================================================================
# deploy-node.sh — развёртывание узла организации (org_agent) на Ubuntu-сервере
# ============================================================================
# Узел управляет школьными стеками локально; ядро даёт команды через HTTP API.
# Запуск на сервере ноды:
#   sudo bash deploy-node.sh --core-url https://admin.grsn-panel.ru --enroll-token <TOKEN>
#
# Токен подключения (enrollment token) получается в ядре:
#   Консоль платформы → Инфраструктура → Создать ноду → скопировать токен
#
# Флаги:
#   --core-url URL        URL ядра (ОБЯЗАТЕЛЕН)
#   --enroll-token TOKEN  Токен подключения к ядру (ОБЯЗАТЕЛЕН)
#   --agent-token TOKEN   AGENT_TOKEN (по умолчанию из переменной или auto)
#   --tenant-image IMG    Образ тенанта для школ (по умолчанию: ghcr.io/syb1v/perum-tenant:latest)
#   --registry REGISTRY   Реестр базовых образов (по умолчанию: mirror.gcr.io)
#   --dir DIR             Каталог установки (по умолчанию: /opt/perum-node)
#   --dry-run             Только показать, что будет сделано
#   --no-docker           Пропустить установку Docker
#   -h, --help            Справка
# ============================================================================

set -euo pipefail

# ── Цвета ─────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; GRAY='\033[0;90m'; NC='\033[0m'

log()   { echo -e "${GREEN}[НОДА]${NC} $*"; }
step()  { echo -e "\n${CYAN}[$1]${NC} ${2}"; }
info()  { echo -e "  ${GRAY}→${NC} ${1}"; }
warn()  { echo -e "  ${YELLOW}!${NC} ${1}"; }
ok()    { echo -e "  ${GREEN}✓${NC} ${1}"; }
err()   { echo -e "${RED}✗${NC} ${1}" >&2; }
die()   { err "$1"; exit 1; }

# ── Параметры ────────────────────────────────────────────────────────────
CORE_URL=""
ENROLL_TOKEN=""
AGENT_TOKEN="${AGENT_TOKEN:-}"
TENANT_IMAGE="${TENANT_IMAGE:-ghcr.io/syb1v/perum-tenant:latest}"
IMAGE_REGISTRY="${IMAGE_REGISTRY:-mirror.gcr.io}"
AGENT_IMAGE="${AGENT_IMAGE:-ghcr.io/syb1v/perum-core:latest}"
PUBLIC_BASE_DOMAIN="${PUBLIC_BASE_DOMAIN:-}"
INSTALL_DIR="/opt/perum-node"
DRY_RUN=false
NO_DOCKER=false

usage() {
  sed -n '3,22p' "$0" | grep -E '^#( |$)' | sed 's/^# \?//'
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --core-url)      CORE_URL="$2"; shift 2 ;;
    --enroll-token)  ENROLL_TOKEN="$2"; shift 2 ;;
    --agent-token)   AGENT_TOKEN="$2"; shift 2 ;;
    --tenant-image)  TENANT_IMAGE="$2"; shift 2 ;;
    --registry)      IMAGE_REGISTRY="$2"; shift 2 ;;
    --dir)           INSTALL_DIR="$2"; shift 2 ;;
    --dry-run)       DRY_RUN=true; shift ;;
    --no-docker)     NO_DOCKER=true; shift ;;
    -h|--help)       usage ;;
    *) die "Неизвестный аргумент: $1. Используйте --help" ;;
  esac
done

# ── Интерактивный режим ──────────────────────────────────────────────────
if [[ -z "$CORE_URL" ]]; then
  read -r -p "URL ядра (напр. https://admin.grsn-panel.ru): " CORE_URL
  [[ -z "$CORE_URL" ]] && die "URL ядра обязателен"
fi
if [[ -z "$ENROLL_TOKEN" ]]; then
  read -r -p "Токен подключения (из ядра: Инфраструктура → Создать ноду): " ENROLL_TOKEN
  [[ -z "$ENROLL_TOKEN" ]] && die "Токен подключения обязателен"
fi
if [[ -z "$AGENT_TOKEN" ]]; then
  AGENT_TOKEN=$(openssl rand -hex 32)
  warn "AGENT_TOKEN сгенерирован автоматически. Убедись, что в ядре тот же токен!"
fi
if [[ -z "$PUBLIC_BASE_DOMAIN" ]]; then
  PUBLIC_BASE_DOMAIN=$(echo "$CORE_URL" | sed -E 's|https?://||; s|^admin\.||; s|/.*||; s|:.*||')
  warn "PUBLIC_BASE_DOMAIN определён из CORE_URL: ${PUBLIC_BASE_DOMAIN}"
fi

# ── Проверка прав ────────────────────────────────────────────────────────
if [[ "$DRY_RUN" != true ]]; then
  if [[ "$EUID" -ne 0 ]] && ! sudo -n true 2>/dev/null; then
    die "Нужны root-права. Запустите: sudo bash $0 --core-url $CORE_URL --enroll-token ..."
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

# ═══════════════════════════════════════════════════════════════════════════
echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║${NC}     ${GREEN}PERUM Node — Развёртывание узла${NC}        ${CYAN}║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════╝${NC}"
echo ""
info "Ядро   : ${CORE_URL}"
info "Домен  : ${PUBLIC_BASE_DOMAIN}"
info "Каталог: ${INSTALL_DIR}"

# ── [1/8] Docker ─────────────────────────────────────────────────────────
if [[ "$NO_DOCKER" != true ]]; then
  step "1/8" "Установка Docker..."
  if command -v docker &>/dev/null; then
    ok "Docker уже установлен: $(docker --version)"
  else
    info "Устанавливаю Docker..."
    run "curl -fsSL https://get.docker.com | sh"
    run "systemctl enable --now docker"
    ok "Docker установлен"
  fi
  if ! docker compose version &>/dev/null; then
    run "apt-get update -qq && apt-get install -y -qq docker-compose-plugin"
  fi
  ok "Docker Compose: $(docker compose version)"
else
  step "1/8" "Docker — ПРОПУЩЕН (--no-docker)"
fi

# ── [2/8] Создание каталога ──────────────────────────────────────────────
step "2/8" "Создание каталога ${INSTALL_DIR}..."
run "mkdir -p ${INSTALL_DIR}/caddy"
cd "$INSTALL_DIR" 2>/dev/null || run "cd ${INSTALL_DIR}"

# ── [3/8] .env (секреты) ─────────────────────────────────────────────────
step "3/8" "Генерация секретов..."

NODE_DB_PW=$(openssl rand -hex 16)
SECRET_KEY=$(openssl rand -hex 24)

run "cat > ${INSTALL_DIR}/.env <<'ENVEOF'
ENROLLMENT_TOKEN=${ENROLL_TOKEN}
AGENT_TOKEN=${AGENT_TOKEN}
TENANT_IMAGE=${TENANT_IMAGE}
NODE_DB_PW=${NODE_DB_PW}
SECRET_KEY=${SECRET_KEY}
CORE_URL=${CORE_URL}
ACME_EMAIL=${ACME_EMAIL:-ops@perum.ru}
ENVEOF"
run "chmod 600 ${INSTALL_DIR}/.env"
ok ".env создан"

# ── [4/8] docker-compose.yml ─────────────────────────────────────────────
step "4/8" "Запись docker-compose.yml..."

run "cat > ${INSTALL_DIR}/docker-compose.yml <<'COMPOSEEOF'
name: perum-node
services:
  perum_agent:
    image: ${AGENT_IMAGE}
    container_name: perum_agent
    restart: unless-stopped
    pull_policy: always
    labels:
      com.centurylinklabs.watchtower.enable: \"true\"
    environment:
      ROLE: org_agent
      ENROLLMENT_TOKEN: \${ENROLLMENT_TOKEN}
      AGENT_TOKEN: \${AGENT_TOKEN}
      CORE_URL: ${CORE_URL}
      CONTROL_PLANE_URL: ${CORE_URL}
      DATABASE_URL: postgresql+asyncpg://perum:\${NODE_DB_PW}@perum_node_db:5432/perum_node
      SECRET_KEY: \${SECRET_KEY}
      DOCKER_HOST: tcp://docker_proxy:2375
      CADDY_ADMIN_URL: http://caddy:2019
      SHARED_REDIS_URL: redis://shared_redis:6379
      PUBLIC_BASE_DOMAIN: ${PUBLIC_BASE_DOMAIN}
      DOCKER_NETWORK: perum_internal
      IMAGE_REGISTRY: ${IMAGE_REGISTRY}
      TENANT_IMAGE: \${TENANT_IMAGE}
    ports:
      - '${AGENT_PORT:-3001}:3000'
    depends_on:
      perum_node_db:
        condition: service_healthy
      docker_proxy:
        condition: service_started
    networks:
      - perum_internal
    command:
      - sh
      - -c
      - |
        alembic upgrade head &&
        exec uvicorn app.main:app --host 0.0.0.0 --port 3000 --proxy-headers --forwarded-allow-ips=*

  perum_node_db:
    image: ${IMAGE_REGISTRY}/library/postgres:15-alpine
    container_name: perum_node_db
    restart: unless-stopped
    environment:
      POSTGRES_USER: perum
      POSTGRES_PASSWORD: \${NODE_DB_PW}
      POSTGRES_DB: perum_node
    volumes:
      - node_pgdata:/var/lib/postgresql/data
    healthcheck:
      test: [\"CMD-SHELL\", \"pg_isready -U perum -d perum_node\"]
      interval: 5s
      timeout: 3s
      retries: 10
    networks:
      - perum_internal

  shared_redis:
    image: ${IMAGE_REGISTRY}/library/redis:7-alpine
    container_name: shared_redis
    restart: unless-stopped
    command: [\"redis-server\", \"--maxmemory\", \"128mb\", \"--maxmemory-policy\", \"allkeys-lru\"]
    networks:
      - perum_internal

  docker_proxy:
    image: tecnativa/docker-socket-proxy:0.3
    container_name: docker_proxy
    restart: unless-stopped
    environment:
      CONTAINERS: 1
      IMAGES: 1
      VOLUMES: 1
      NETWORKS: 1
      EXEC: 1
      POST: 1
      VERSION: 1
      PING: 1
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    networks:
      - perum_internal

  caddy:
    image: ${IMAGE_REGISTRY}/library/caddy:2-alpine
    container_name: caddy
    restart: unless-stopped
    ports:
      - '80:80'
      - '443:443'
    environment:
      CORE_URL: ${CORE_URL}
      ACME_EMAIL: ${ACME_EMAIL:-ops@perum.ru}
    volumes:
      - ./caddy/Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    networks:
      - perum_internal

  watchtower:
    image: ghcr.io/containrrr/watchtower:latest
    container_name: perum_watchtower
    restart: unless-stopped
    environment:
      WATCHTOWER_LABEL_ENABLE: \"true\"
      WATCHTOWER_CLEANUP: \"true\"
      WATCHTOWER_POLL_INTERVAL: \"120\"
      DOCKER_API_VERSION: \"1.44\"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    networks:
      - perum_internal

volumes:
  node_pgdata:
  caddy_data:
  caddy_config:

networks:
  perum_internal:
    name: perum_internal
    driver: bridge
COMPOSEEOF"
ok "docker-compose.yml записан"

# ── [5/8] Caddyfile ─────────────────────────────────────────────────────
step "5/8" "Запись Caddyfile..."
run "cat > ${INSTALL_DIR}/caddy/Caddyfile <<'CADDYEOF'
{
    admin 0.0.0.0:2019
    email {$ACME_EMAIL:ops@perum.ru}
    on_demand_tls {
        ask {$CORE_URL}/internal/validate-domain
    }
}

:80 {
    respond \"PERUM node OK\" 200
}
CADDYEOF"
ok "Caddyfile записан"

# ── [6/8] Предзагрузка docker-socket-proxy ───────────────────────────────
if [[ "$DRY_RUN" != true ]]; then
  step "6/8" "Предзагрузка docker-socket-proxy..."
  run "
    if ! docker image inspect tecnativa/docker-socket-proxy:0.3 &>/dev/null; then
      docker pull tecnativa/docker-socket-proxy:0.3 2>/dev/null || {
        docker pull mirror.gcr.io/tecnativa/docker-socket-proxy:0.3 &&
        docker tag mirror.gcr.io/tecnativa/docker-socket-proxy:0.3 tecnativa/docker-socket-proxy:0.3
      }
    fi
  "
  ok "docker-socket-proxy готов"
fi

# ── [7/8] Запуск стека ──────────────────────────────────────────────────
step "7/8" "Запуск стека ноды..."
cd "$INSTALL_DIR"
run "docker compose pull 2>&1" || warn "Пуллинг образов частично не удался (может потребоваться зеркало)"
run "docker compose up -d"
ok "Стек запущен"

# ── [8/8] Проверка готовности ───────────────────────────────────────────
step "8/8" "Ожидание готовности воркера..."

MAX_WAIT=90
WAITED=0
READY=false
while [[ $WAITED -lt $MAX_WAIT ]]; do
  if [[ "$DRY_RUN" == true ]]; then
    info "[DRY RUN] Проверка здоровья пропущена"
    READY=true
    break
  fi
  if curl -sf http://127.0.0.1:${AGENT_PORT:-3001}/api/agent/health > /dev/null 2>&1; then
    ok "Воркер готов"
    READY=true
    break
  fi
  sleep 3
  WAITED=$((WAITED + 3))
done

if [[ "$READY" != true ]] && [[ "$DRY_RUN" != true ]]; then
  warn "Воркер не стал готов за ${MAX_WAIT}с. Проверь логи:"
  echo "  cd ${INSTALL_DIR} && docker compose logs perum_agent"
fi

# ── Финал ─────────────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║${NC}              ${GREEN}Узел развёрнут${NC}                              ${CYAN}║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${GREEN}Каталог:${NC}     ${INSTALL_DIR}"
echo -e "  ${GREEN}Ядро:${NC}        ${CORE_URL}"
echo -e "  ${GREEN}Воркер API:${NC}  http://127.0.0.1:${AGENT_PORT:-3001}/api/agent/health"
echo ""
echo -e "  ${YELLOW}Полезные команды:${NC}"
echo -e "  ${GRAY}  cd ${INSTALL_DIR}${NC}"
echo -e "  ${GRAY}  docker compose ps${NC}"
echo -e "  ${GRAY}  docker compose logs -f perum_agent${NC}"
echo -e "  ${GRAY}  curl http://127.0.0.1:${AGENT_PORT:-3001}/api/agent/health${NC}"
