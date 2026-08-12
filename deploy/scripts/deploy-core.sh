#!/usr/bin/env bash
# ============================================================================
# deploy-core.sh — развёртывание perum-core (Control Plane) на Ubuntu-сервере
# ============================================================================
# Запуск прямо на сервере:
#   bash deploy-core.sh --domain xn--l1afdm2c.xn--p1ai
#   bash deploy-core.sh --domain xn--l1afdm2c.xn--p1ai --email ops@xn--l1afdm2c.xn--p1ai
#
# Флаги:
#   --domain DOMAIN       Домен платформы (ОБЯЗАТЕЛЕН)
#   --email EMAIL         Email для ACME/TLS (без него: admin@<domain>)
#   --repo URL            URL репо  (по умолчанию: git@github.com:syb1v/perum.git)
#   --branch BRANCH       Ветка     (по умолчанию: main)
#   --commit SHA          Точный 40-символьный commit для --update
#   --core-image IMG      Образ Core (immutable для --update/--no-build)
#   --web-image IMG       Образ Web (immutable для --update)
#   --core-runtime-image  Локальный image ID Core для неизменённого компонента
#   --web-runtime-image   Локальный image ID Web для неизменённого компонента
#   --path DIR            Путь      (по умолчанию: /opt/perum)
#   --no-docker           Пропустить установку Docker (уже есть)
#   --no-clone            Пропустить клон репо (уже есть)
#   --no-build            Тянуть perum_core из GHCR вместо локальной сборки
#                         (perum_web ВСЕГДА собирается локально — domain-specific)
#   --skip-secrets        Не генерировать секреты (использовать готовый .env.prod)
#   --dry-run             Только показать, что будет сделано
#   --update              Режим обновления (без первичной настройки)
#   --pull-never          Не обращаться к registry, использовать локальные образы
#   -h, --help            Справка
# ============================================================================

set -Eeuo pipefail

ORIGINAL_ARGS=("$@")

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
COMMIT=""
CORE_IMAGE="${CORE_IMAGE:-}"
AGENT_IMAGE="${AGENT_IMAGE:-}"
WEB_IMAGE="${WEB_IMAGE:-}"
CORE_RUNTIME_IMAGE=""
WEB_RUNTIME_IMAGE=""
DEPLOY_PATH="/opt/perum"
NO_DOCKER=false
NO_CLONE=false
NO_BUILD=false
SKIP_SECRETS=false
DRY_RUN=false
UPDATE=false
PULL_NEVER=false
MIN_DEPLOY_FREE_KB=$((5 * 1024 * 1024))

usage() {
  sed -n '3,26p' "$0" | grep -E '^(# |#$)' | sed 's/^# \?//'
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain)       DOMAIN="$2"; shift 2 ;;
    --email)        EMAIL="$2"; shift 2 ;;
    --repo)         REPO_URL="$2"; shift 2 ;;
    --branch)       BRANCH="$2"; shift 2 ;;
    --commit)       COMMIT="$2"; shift 2 ;;
    --core-image)   CORE_IMAGE="$2"; shift 2 ;;
    --web-image)    WEB_IMAGE="$2"; shift 2 ;;
    --core-runtime-image) CORE_RUNTIME_IMAGE="$2"; shift 2 ;;
    --web-runtime-image)  WEB_RUNTIME_IMAGE="$2"; shift 2 ;;
    --path)         DEPLOY_PATH="$2"; shift 2 ;;
    --no-docker)    NO_DOCKER=true; shift ;;
    --no-clone)     NO_CLONE=true; shift ;;
    --no-build)     NO_BUILD=true; shift ;;
    --skip-secrets) SKIP_SECRETS=true; shift ;;
    --dry-run)      DRY_RUN=true; shift ;;
    --update)       UPDATE=true; shift ;;
    --pull-never)   PULL_NEVER=true; shift ;;
    -h|--help)      usage ;;
    *) die "Неизвестный аргумент: $1. Используйте --help" ;;
  esac
done

[[ -z "$DOMAIN" || "$DOMAIN" =~ ^([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,63}$ || "$UPDATE" == true ]] \
  || die "Некорректный домен: ${DOMAIN}"
[[ -z "$EMAIL" || "$EMAIL" =~ ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,63}$ ]] \
  || die "Некорректный email: ${EMAIL}"
[[ "$BRANCH" =~ ^[a-zA-Z0-9._/-]+$ ]] || die "Некорректное имя ветки"
[[ "$DEPLOY_PATH" =~ ^/[a-zA-Z0-9._/-]+$ ]] || die "Некорректный абсолютный путь"
[[ "$REPO_URL" =~ ^(git@github\.com:|https://github\.com/)[a-zA-Z0-9._/-]+\.git$ ]] \
  || die "Поддерживаются только SSH/HTTPS GitHub repository URL"

validate_app_image() {
  local name="$1" image="$2"
  [[ -n "$image" ]] || die "$name обязателен"
  validate_image_syntax "$name" "$image"
  [[ "$image" =~ @sha256:[0-9a-fA-F]{64}$ || "$image" =~ :git-[0-9a-fA-F]{12,}$ ]] \
    || die "$name должен быть portable registry digest или git-<sha> tag длиной не менее 12 символов"
}

validate_runtime_image_id() {
  local name="$1" image="$2"
  [[ "$image" =~ ^sha256:[0-9a-fA-F]{64}$ ]] || die "$name должен быть exact runtime sha256 image ID"
}

validate_image_syntax() {
  local name="$1" image="$2"
  [[ "$image" =~ ^[A-Za-z0-9][A-Za-z0-9._:/@-]*$ ]] || die "$name содержит недопустимые символы"
}

require_deploy_disk_headroom() {
  local available_kb
  if [[ "$DRY_RUN" == true ]]; then
    info "[DRY RUN] Требуется минимум 5 GiB свободного места перед pull"
    return 0
  fi
  available_kb=$(df -Pk / | awk 'NR == 2 {print $4}')
  [[ "$available_kb" =~ ^[0-9]+$ ]] || die "Не удалось определить свободное место на root filesystem"
  (( available_kb >= MIN_DEPLOY_FREE_KB )) || die "Недостаточно места для безопасного deploy: требуется минимум 5 GiB до pull"
}

env_value() {
  local key="$1" file="${DEPLOY_PATH}/deploy/.env.prod" line
  [[ -f "$file" ]] || return 1
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "${line%%=*}" == "$key" ]] && { printf '%s' "${line#*=}"; return 0; }
  done < "$file"
  return 1
}

wait_for_app_readiness() {
  local attempt
  if [[ "$DRY_RUN" == true ]]; then
    info "[DRY RUN] До 12 проверок perum_core /health и статуса perum_web с интервалом 5с"
    return 0
  fi
  for attempt in $(seq 1 12); do
    if docker exec perum_core curl -fsS http://localhost:3000/health >/dev/null 2>&1 \
      && [[ "$(docker inspect --format '{{.State.Health.Status}}' perum_web 2>/dev/null)" == "healthy" ]]; then
      return 0
    fi
    sleep 5
  done
  return 1
}

persist_app_images() {
  local core_image="${1:-$CORE_IMAGE}" agent_image="${2:-$AGENT_IMAGE}" web_image="${3:-$WEB_IMAGE}"
  local env_file="${DEPLOY_PATH}/deploy/.env.prod"
  validate_image_syntax "persisted CORE_IMAGE" "$core_image"
  validate_image_syntax "persisted AGENT_IMAGE" "$agent_image"
  validate_image_syntax "persisted WEB_IMAGE" "$web_image"
  run "env_tmp=\$(mktemp '${env_file}.tmp.XXXXXX') && cp --preserve=mode,ownership '${env_file}' \"\$env_tmp\" && sed -i -e 's|^CORE_IMAGE=.*|CORE_IMAGE=${core_image}|' -e 's|^AGENT_IMAGE=.*|AGENT_IMAGE=${agent_image}|' -e 's|^WEB_IMAGE=.*|WEB_IMAGE=${web_image}|' \"\$env_tmp\" && { grep -q '^CORE_IMAGE=' \"\$env_tmp\" || printf '%s\\n' 'CORE_IMAGE=${core_image}' >> \"\$env_tmp\"; } && { grep -q '^AGENT_IMAGE=' \"\$env_tmp\" || printf '%s\\n' 'AGENT_IMAGE=${agent_image}' >> \"\$env_tmp\"; } && { grep -q '^WEB_IMAGE=' \"\$env_tmp\" || printf '%s\\n' 'WEB_IMAGE=${web_image}' >> \"\$env_tmp\"; } && mv -f \"\$env_tmp\" '${env_file}'"
}

# ── Авто-режим: если запущено без --domain и без --update — спросить ─────
if [[ "$UPDATE" != true ]] && [[ -z "$DOMAIN" ]]; then
  if [[ -t 0 ]]; then
    read -r -p "Домен платформы (напр. grsn-panel.ru): " DOMAIN
    [[ -z "$DOMAIN" ]] && die "Домен обязателен"
  else
    die "Укажите --domain <домен> для первичной установки или --update для обновления"
  fi
fi

if [[ "$UPDATE" != true && -z "$EMAIL" ]]; then
  EMAIL="admin@${DOMAIN}"
fi

# ── Проверка прав ────────────────────────────────────────────────────────
if [[ "$DRY_RUN" != true ]]; then
  if [[ "$EUID" -ne 0 ]] && ! sudo -n true 2>/dev/null; then
    die "Нужны root-права. Запустите через sudo bash $0 --domain ${DOMAIN:-...}"
  fi
  if [[ "${PERUM_DEPLOY_LOCKED:-}" != "1" ]]; then
    if [[ "$EUID" -eq 0 ]]; then
      mkdir -p "$DEPLOY_PATH"
      exec flock -n "${DEPLOY_PATH}/.deploy.lock" env PERUM_DEPLOY_LOCKED=1 bash "$0" "${ORIGINAL_ARGS[@]}"
    else
      sudo mkdir -p "$DEPLOY_PATH"
      exec sudo flock -n "${DEPLOY_PATH}/.deploy.lock" env PERUM_DEPLOY_LOCKED=1 bash "$0" "${ORIGINAL_ARGS[@]}"
    fi
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

  [[ "$COMMIT" =~ ^[0-9a-fA-F]{40}$ ]] || die "Для --update обязателен точный 40-символьный --commit"
  [[ -f "${DEPLOY_PATH}/deploy/.env.prod" ]] || die "Не найден ${DEPLOY_PATH}/deploy/.env.prod"
  PREVIOUS_CORE_IMAGE=$(env_value CORE_IMAGE || true)
  PREVIOUS_AGENT_IMAGE=$(env_value AGENT_IMAGE || true)
  PREVIOUS_WEB_IMAGE=$(env_value WEB_IMAGE || true)
  [[ -n "$PREVIOUS_AGENT_IMAGE" ]] || PREVIOUS_AGENT_IMAGE="$PREVIOUS_CORE_IMAGE"
  [[ -n "$CORE_IMAGE" ]] || CORE_IMAGE=$(env_value CORE_IMAGE || true)
  [[ -n "$WEB_IMAGE" ]] || WEB_IMAGE=$(env_value WEB_IMAGE || true)
  AGENT_IMAGE="$CORE_IMAGE"
  validate_app_image "CORE_IMAGE" "$CORE_IMAGE"
  validate_app_image "AGENT_IMAGE" "$AGENT_IMAGE"
  validate_app_image "WEB_IMAGE" "$WEB_IMAGE"
  [[ -z "$CORE_RUNTIME_IMAGE" ]] || validate_runtime_image_id "CORE_RUNTIME_IMAGE" "$CORE_RUNTIME_IMAGE"
  [[ -z "$WEB_RUNTIME_IMAGE" ]] || validate_runtime_image_id "WEB_RUNTIME_IMAGE" "$WEB_RUNTIME_IMAGE"
  if [[ "$PULL_NEVER" == true ]]; then
    [[ -n "$CORE_RUNTIME_IMAGE" || ! "$CORE_IMAGE" =~ :git-[0-9a-fA-F]{12,}$ ]] || die "--pull-never требует CORE_RUNTIME_IMAGE для portable CORE_IMAGE git tag"
    [[ -n "$WEB_RUNTIME_IMAGE" || ! "$WEB_IMAGE" =~ :git-[0-9a-fA-F]{12,}$ ]] || die "--pull-never требует WEB_RUNTIME_IMAGE для portable WEB_IMAGE git tag"
  fi
  [[ -n "$DOMAIN" ]] || DOMAIN=$(env_value PUBLIC_BASE_DOMAIN || true)

  if [[ "$DRY_RUN" == true ]]; then
    info "[DRY RUN] PREVIOUS_COMMIT=\$(git -C '${DEPLOY_PATH}' rev-parse HEAD)"
    PREVIOUS_COMMIT="0000000000000000000000000000000000000000"
    PREVIOUS_CORE_RUNTIME_IMAGE="sha256:0000000000000000000000000000000000000000000000000000000000000000"
    PREVIOUS_WEB_RUNTIME_IMAGE="sha256:0000000000000000000000000000000000000000000000000000000000000000"
    ROLLBACK_ENV_BACKUP=""
  else
    PREVIOUS_COMMIT=$(git -C "${DEPLOY_PATH}" rev-parse HEAD) \
      || die "Не удалось определить текущий git commit в ${DEPLOY_PATH}"
    PREVIOUS_CORE_RUNTIME_IMAGE=$(docker inspect --format '{{.Image}}' perum_core 2>/dev/null) \
      || die "Не удалось определить текущий image ID контейнера perum_core"
    PREVIOUS_WEB_RUNTIME_IMAGE=$(docker inspect --format '{{.Image}}' perum_web 2>/dev/null) \
      || die "Не удалось определить текущий image ID контейнера perum_web"
    ROLLBACK_ENV_BACKUP=$(mktemp)
    cp --preserve=mode,ownership,timestamps "${DEPLOY_PATH}/deploy/.env.prod" "$ROLLBACK_ENV_BACKUP"
  fi
  [[ "$PREVIOUS_COMMIT" =~ ^[0-9a-fA-F]{40}$ ]] || die "Текущий git commit некорректен"

  if [[ "$DRY_RUN" != true ]]; then
    PREVIOUS_CORE_IMAGE=$(docker inspect --format '{{.Config.Image}}' perum_core 2>/dev/null || printf '%s' "$PREVIOUS_CORE_IMAGE")
    PREVIOUS_WEB_IMAGE=$(docker inspect --format '{{.Config.Image}}' perum_web 2>/dev/null || printf '%s' "$PREVIOUS_WEB_IMAGE")
  fi
  validate_image_syntax "предыдущий CORE_IMAGE" "$PREVIOUS_CORE_IMAGE"
  validate_image_syntax "предыдущий AGENT_IMAGE" "$PREVIOUS_AGENT_IMAGE"
  validate_image_syntax "предыдущий WEB_IMAGE" "$PREVIOUS_WEB_IMAGE"
  validate_runtime_image_id "предыдущий runtime CORE_IMAGE" "$PREVIOUS_CORE_RUNTIME_IMAGE"
  validate_runtime_image_id "предыдущий runtime WEB_IMAGE" "$PREVIOUS_WEB_RUNTIME_IMAGE"
  run "docker image inspect '${PREVIOUS_CORE_RUNTIME_IMAGE}' >/dev/null && docker image inspect '${PREVIOUS_WEB_RUNTIME_IMAGE}' >/dev/null"

  COMPOSE_PREFLIGHT="cd ${DEPLOY_PATH} && CORE_IMAGE=${CORE_IMAGE} AGENT_IMAGE=${AGENT_IMAGE} WEB_IMAGE=${WEB_IMAGE} CORE_PULL_POLICY=missing WEB_PULL_POLICY=missing docker compose -f deploy/docker-compose.core.yml -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod"
  ROLLBACK_ACTIVE=false
  TARGET_CHECKOUT_COMPLETE=false

  rollback_update() {
    local failure_status="${1:-$?}" rollback_failed=false
    trap - ERR INT TERM
    set +e
    if [[ "$ROLLBACK_ACTIVE" != true ]]; then
      [[ -n "$ROLLBACK_ENV_BACKUP" ]] && rm -f "$ROLLBACK_ENV_BACKUP"
      exit "$failure_status"
    fi
    ROLLBACK_ACTIVE=false
    if [[ "$TARGET_CHECKOUT_COMPLETE" != true ]]; then
      warn "Переключение на target commit завершилось ошибкой; восстанавливаю предыдущий checkout"
      run "cd ${DEPLOY_PATH} && git checkout --detach '${PREVIOUS_COMMIT}'" || rollback_failed=true
      [[ -n "$ROLLBACK_ENV_BACKUP" ]] && rm -f "$ROLLBACK_ENV_BACKUP"
      [[ "$rollback_failed" != true ]] || err "Не удалось восстановить предыдущий checkout"
      exit "$failure_status"
    fi
    warn "Обновление завершилось ошибкой; восстанавливаю предыдущую конфигурацию и образы"
    if [[ "$DRY_RUN" != true ]]; then
      cp --preserve=mode,ownership,timestamps "$ROLLBACK_ENV_BACKUP" "${DEPLOY_PATH}/deploy/.env.prod" || rollback_failed=true
    fi
    ROLLBACK_COMPOSE="cd ${DEPLOY_PATH} && CORE_RUNTIME_IMAGE=${PREVIOUS_CORE_RUNTIME_IMAGE} WEB_RUNTIME_IMAGE=${PREVIOUS_WEB_RUNTIME_IMAGE} CORE_PULL_POLICY=missing WEB_PULL_POLICY=missing docker compose -f deploy/docker-compose.core.yml -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod"
    run "${ROLLBACK_COMPOSE} config -q" || rollback_failed=true
    run "docker image inspect '${PREVIOUS_CORE_RUNTIME_IMAGE}' >/dev/null && docker image inspect '${PREVIOUS_WEB_RUNTIME_IMAGE}' >/dev/null" || rollback_failed=true
    run "${ROLLBACK_COMPOSE} up -d --pull never --force-recreate perum_core perum_web" || rollback_failed=true
    wait_for_app_readiness || rollback_failed=true
    [[ "$(docker inspect --format '{{.Image}}' perum_core 2>/dev/null)" == "$PREVIOUS_CORE_RUNTIME_IMAGE" ]] || rollback_failed=true
    [[ "$(docker inspect --format '{{.Image}}' perum_web 2>/dev/null)" == "$PREVIOUS_WEB_RUNTIME_IMAGE" ]] || rollback_failed=true
    run "cd ${DEPLOY_PATH} && git checkout --detach '${PREVIOUS_COMMIT}'" || rollback_failed=true
    [[ -n "$ROLLBACK_ENV_BACKUP" ]] && rm -f "$ROLLBACK_ENV_BACKUP"
    if [[ "$rollback_failed" == true ]]; then
      err "Обновление и rollback не прошли проверку; проверьте docker compose logs perum_core perum_web"
      exit 1
    fi
    err "Обновление не выполнено; предыдущий commit, конфигурация и Core/Web образы восстановлены и готовы"
    exit "$failure_status"
  }
  trap rollback_update ERR
  trap 'rollback_update 130' INT
  trap 'rollback_update 143' TERM

  step "1" "Проверка текущей Compose-конфигурации..."
  run "${COMPOSE_PREFLIGHT} config -q"
  require_deploy_disk_headroom

  step "2" "Переключение на commit ${COMMIT}..."
  run "cd ${DEPLOY_PATH} && git diff --quiet && git diff --cached --quiet"
  run "cd ${DEPLOY_PATH} && git fetch --no-tags origin ${COMMIT} && git cat-file -e ${COMMIT}^{commit}"
  ROLLBACK_ACTIVE=true
  run "cd ${DEPLOY_PATH} && git checkout --detach ${COMMIT}"
  TARGET_CHECKOUT_COMPLETE=true
  run "${COMPOSE_PREFLIGHT} config -q"

  step "3" "Проверка образов..."
  for image in ${CORE_RUNTIME_IMAGE:+} "$CORE_IMAGE" ${WEB_RUNTIME_IMAGE:+} "$WEB_IMAGE"; do
    [[ "$image" == "$CORE_IMAGE" && -n "$CORE_RUNTIME_IMAGE" ]] && continue
    [[ "$image" == "$WEB_IMAGE" && -n "$WEB_RUNTIME_IMAGE" ]] && continue
    if [[ "$image" =~ :git-[0-9a-fA-F]{12,}$ ]]; then
      run "docker pull '${image}'"
    elif [[ "$PULL_NEVER" != true ]]; then
      run "docker image inspect '${image}' >/dev/null 2>&1 || docker pull '${image}'"
    fi
    run "docker image inspect '${image}' >/dev/null"
  done
  if [[ "$DRY_RUN" == true ]]; then
    EXPECTED_CORE_ID="sha256:0000000000000000000000000000000000000000000000000000000000000000"
    EXPECTED_WEB_ID="sha256:0000000000000000000000000000000000000000000000000000000000000000"
    info "[DRY RUN] EXPECTED_CORE_ID/EXPECTED_WEB_ID из docker image inspect --format '{{.Id}}'"
  else
    if [[ -n "$CORE_RUNTIME_IMAGE" ]]; then
      docker image inspect "$CORE_RUNTIME_IMAGE" >/dev/null
      EXPECTED_CORE_ID="$CORE_RUNTIME_IMAGE"
    else
      EXPECTED_CORE_ID=$(docker image inspect --format '{{.Id}}' "$CORE_IMAGE")
    fi
    if [[ -n "$WEB_RUNTIME_IMAGE" ]]; then
      docker image inspect "$WEB_RUNTIME_IMAGE" >/dev/null
      EXPECTED_WEB_ID="$WEB_RUNTIME_IMAGE"
    else
      EXPECTED_WEB_ID=$(docker image inspect --format '{{.Id}}' "$WEB_IMAGE")
    fi
  fi
  [[ "$EXPECTED_CORE_ID" =~ ^sha256:[0-9a-fA-F]{64}$ ]] \
    || { err "resolved CORE_IMAGE не является exact runtime sha256 image ID"; false; }
  [[ "$EXPECTED_WEB_ID" =~ ^sha256:[0-9a-fA-F]{64}$ ]] \
    || { err "resolved WEB_IMAGE не является exact runtime sha256 image ID"; false; }
  COMPOSE_UPDATE="cd ${DEPLOY_PATH} && CORE_IMAGE=${CORE_IMAGE} AGENT_IMAGE=${AGENT_IMAGE} WEB_IMAGE=${WEB_IMAGE} CORE_RUNTIME_IMAGE=${EXPECTED_CORE_ID} WEB_RUNTIME_IMAGE=${EXPECTED_WEB_ID} CORE_PULL_POLICY=missing WEB_PULL_POLICY=missing docker compose -f deploy/docker-compose.core.yml -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod"
  run "${COMPOSE_UPDATE} config -q"

  step "4" "docker compose up -d --force-recreate perum_core perum_web..."
  run "${COMPOSE_UPDATE} up -d --pull never --force-recreate perum_core perum_web"

  step "5" "Ожидание готовности perum_core и perum_web..."
  wait_for_app_readiness
  if [[ "$DRY_RUN" != true ]]; then
    [[ "$(docker inspect --format '{{.Image}}' perum_core 2>/dev/null)" == "$EXPECTED_CORE_ID" ]] \
      || { err "perum_core запущен не из ожидаемого image ID"; false; }
    [[ "$(docker inspect --format '{{.Image}}' perum_web 2>/dev/null)" == "$EXPECTED_WEB_ID" ]] \
      || { err "perum_web запущен не из ожидаемого image ID"; false; }
  fi
  persist_app_images "$CORE_IMAGE" "$AGENT_IMAGE" "$WEB_IMAGE"
  ROLLBACK_ACTIVE=false
  trap - ERR INT TERM
  [[ -n "$ROLLBACK_ENV_BACKUP" ]] && rm -f "$ROLLBACK_ENV_BACKUP"
  ok "perum_core и perum_web готовы; новые образы сохранены в deploy/.env.prod"

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

step "0/7" "Установка системных зависимостей..."
run "apt-get update -qq && apt-get install -y -qq ca-certificates curl git openssl python3"

# ── [1/7] Docker ─────────────────────────────────────────────────────────
if [[ "$NO_DOCKER" != true ]]; then
  step "1/7" "Установка Docker..."
  if command -v docker &>/dev/null; then
    ok "Docker уже установлен: $(docker --version)"
  else
    info "Устанавливаю Docker..."
    run "curl -fsSL https://get.docker.com | sh"
    run "systemctl enable --now docker"
    [[ "$DRY_RUN" == true ]] || ok "Docker установлен: $(docker --version)"
  fi

  if ! docker compose version &>/dev/null; then
    info "Устанавливаю docker compose plugin..."
    run "apt-get update -qq && apt-get install -y -qq docker-compose-plugin"
  fi
  [[ "$DRY_RUN" == true ]] || ok "Docker Compose: $(docker compose version)"
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
  ENCRYPTION_KEY=$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '\n')
  METRICS_TOKEN=$(openssl rand -hex 16)
  BOOTSTRAP_PASSWORD=$(openssl rand -hex 8)
  RELEASE_PUBLISH_TOKEN=$(python3 -c "import secrets; print(secrets.token_urlsafe(32))" 2>/dev/null || openssl rand -hex 32)
  AGENT_TOKEN=$(openssl rand -hex 32)
  GRAFANA_PASSWORD=$(openssl rand -hex 8)
  if [[ "$NO_BUILD" == true ]]; then
    CORE_PULL_POLICY=missing
  else
    CORE_PULL_POLICY=build
  fi

  [[ -n "$CORE_IMAGE" ]] || CORE_IMAGE="perum-core:local-build"
  [[ -n "$WEB_IMAGE" ]] || WEB_IMAGE="perum-web:local-build"
  AGENT_IMAGE="$CORE_IMAGE"
  validate_image_syntax "CORE_IMAGE" "$CORE_IMAGE"
  validate_image_syntax "AGENT_IMAGE" "$AGENT_IMAGE"
  validate_image_syntax "WEB_IMAGE" "$WEB_IMAGE"
  if [[ "$NO_BUILD" == true ]]; then
    validate_app_image "CORE_IMAGE" "$CORE_IMAGE"
  fi

  run "mkdir -p ${DEPLOY_PATH}/deploy"

  run "cat > ${ENV_FILE} <<'PRODENV'
# PERUM — продакшн .env (сгенерирован deploy-core.sh, $(date +%Y-%m-%d))
ENVIRONMENT=prod

# Базовые образы (postgres/redis/caddy). В РФ — зеркало.
IMAGE_REGISTRY=mirror.gcr.io

# Образы приложений (из GHCR)
CORE_IMAGE=${CORE_IMAGE}
AGENT_IMAGE=${AGENT_IMAGE}
WEB_IMAGE=${WEB_IMAGE}
TENANT_IMAGE=ghcr.io/syb1v/perum-tenant:git-__RELEASE_SHA12__

# Pull policy для первичной установки
CORE_PULL_POLICY=${CORE_PULL_POLICY}
WEB_PULL_POLICY=build

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
run "chmod 600 ${ENV_FILE}"

[[ -n "$CORE_IMAGE" ]] || CORE_IMAGE=$(env_value CORE_IMAGE || true)
[[ -n "$WEB_IMAGE" ]] || WEB_IMAGE=$(env_value WEB_IMAGE || true)
if [[ "$NO_BUILD" == true ]]; then
  validate_app_image "CORE_IMAGE" "$CORE_IMAGE"
fi
[[ -n "$CORE_IMAGE" ]] || CORE_IMAGE="perum-core:local-build"
[[ -n "$WEB_IMAGE" ]] || WEB_IMAGE="perum-web:local-build"
AGENT_IMAGE="$CORE_IMAGE"
validate_image_syntax "CORE_IMAGE" "$CORE_IMAGE"
validate_image_syntax "AGENT_IMAGE" "$AGENT_IMAGE"
validate_image_syntax "WEB_IMAGE" "$WEB_IMAGE"

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

if [[ "$PULL_NEVER" == true ]]; then
  run "docker image inspect tecnativa/docker-socket-proxy:0.3 >/dev/null"
  ok "docker-socket-proxy готов"
elif [[ "$NO_BUILD" != true ]]; then
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

CORE_RUNTIME_IMAGE="perum-core:local-build"
WEB_RUNTIME_IMAGE="perum-web:local-build"
if [[ "$NO_BUILD" == true ]]; then
  CORE_RUNTIME_IMAGE="$CORE_IMAGE"
fi
COMPOSE_BASE="cd ${DEPLOY_PATH} && CORE_IMAGE=${CORE_IMAGE} AGENT_IMAGE=${AGENT_IMAGE} WEB_IMAGE=${WEB_IMAGE} CORE_RUNTIME_IMAGE=${CORE_RUNTIME_IMAGE} WEB_RUNTIME_IMAGE=${WEB_RUNTIME_IMAGE} docker compose -f deploy/docker-compose.core.yml -f deploy/docker-compose.prod.yml --env-file ${ENV_FILE}"

run "${COMPOSE_BASE} config -q"

# perum_web ОБЯЗАТЕЛЬНО собираем локально, потому что NEXT_PUBLIC_BASE_DOMAIN
# вшивается в билд. GHCR-образ собран под другой домен — если его использовать,
# апекс будет редиректить на /login вместо лендинга.
info "Сборка perum_web локально с PUBLIC_BASE_DOMAIN=${DOMAIN}..."
run "${COMPOSE_BASE} build --no-cache --build-arg NEXT_PUBLIC_BASE_DOMAIN=${DOMAIN} perum_web"

# perum_core можно либо собрать локально, либо тянуть из GHCR.
# По умолчанию собираем локально для консистентности; флаг --no-build оставлен
# для совместимости, но он влияет только на perum_core/инфраструктуру.
if [[ "$NO_BUILD" == true ]]; then
  if [[ "$PULL_NEVER" == true ]]; then
    info "Проверяем локальный perum_core..."
    run "docker image inspect '${CORE_IMAGE}' >/dev/null"
  else
    info "Тянем perum_core из GHCR..."
    run "docker pull '${CORE_IMAGE}'"
  fi
else
  info "Сборка perum_core локально..."
  run "${COMPOSE_BASE} build --no-cache perum_core 2>&1"
fi

info "Pull базовых сервисов..."
if [[ "$PULL_NEVER" == true ]]; then
  run "${COMPOSE_BASE} config --images | while IFS= read -r image; do docker image inspect \"\$image\" >/dev/null; done"
else
  run "${COMPOSE_BASE} pull perum_control_db shared_redis caddy 2>&1"
fi

ok "Образы готовы"

# ── [7/7] Запуск стека ────────────────────────────────────────────────────
step "7/7" "Запуск perum-core..."

if [[ "$PULL_NEVER" == true ]]; then
  run "${COMPOSE_BASE} up -d --pull never"
else
  run "${COMPOSE_BASE} up -d"
fi

ok "Стек запущен. Жду инициализацию БД (alembic upgrade head)..."
sleep 5

info "Проверка готовности perum_core и perum_web..."
wait_for_app_readiness || die "perum_core/perum_web не прошли проверку готовности за 60 секунд"
persist_app_images
ok "perum_core и perum_web готовы; образы сохранены в deploy/.env.prod"

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
echo -e "  ${C_GRAY}  @     A       <PUBLIC_IP>${C_RESET}"
echo -e "  ${C_GRAY}  admin CNAME   @${C_RESET}"
