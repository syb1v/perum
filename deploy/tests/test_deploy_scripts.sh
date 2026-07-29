#!/usr/bin/env bash

set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
NODE_SCRIPT="${ROOT}/deploy/scripts/deploy-node.sh"
CORE_SCRIPT="${ROOT}/deploy/scripts/deploy-core.sh"
RELEASE_WORKFLOW="${ROOT}/.github/workflows/release.yml"
COMPOSE_FILE="${ROOT}/deploy/docker-compose.core.yml"
ENV_EXAMPLE="${ROOT}/deploy/.env.prod.example"

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

assert_contains() {
  local file="$1" text="$2"
  grep -Fq -- "$text" "$file" || fail "${file} does not contain: ${text}"
}

assert_not_contains() {
  local file="$1" text="$2"
  grep -Fq -- "$text" "$file" && fail "${file} unexpectedly contains: ${text}"
  return 0
}

tmp_dir=$(mktemp -d)
trap 'rm -rf "$tmp_dir"' EXIT
install_dir="${tmp_dir}/installation"
mkdir -p "${install_dir}/caddy"
cat > "${install_dir}/.env" <<'EOF'
ENROLLMENT_TOKEN=persisted-enrollment-secret
AGENT_TOKEN=persisted-agent-secret
AGENT_IMAGE=ghcr.io/example/perum-core:git-aaaaaaaaaaaa
TENANT_IMAGE=ghcr.io/example/perum-tenant:git-bbbbbbbbbbbb
WEB_IMAGE=ghcr.io/example/perum-web:git-cccccccccccc
NODE_DB_PW=persisted-db-secret
SECRET_KEY=persisted-app-secret
EOF
printf '%s\n' sentinel > "${install_dir}/caddy/Caddyfile"
cp "${install_dir}/.env" "${tmp_dir}/env.before"
cp "${install_dir}/caddy/Caddyfile" "${tmp_dir}/caddy.before"

output=$(bash "$NODE_SCRIPT" \
  --core-url https://admin.example.test \
  --agent-image ghcr.io/example/perum-core:git-111111111111 \
  --web-image ghcr.io/example/perum-web:git-333333333333 \
  --dir "$install_dir" \
  --no-docker \
  --dry-run)

cmp -s "${install_dir}/.env" "${tmp_dir}/env.before" || fail "node dry-run changed .env"
cmp -s "${install_dir}/caddy/Caddyfile" "${tmp_dir}/caddy.before" || fail "node dry-run changed Caddyfile"
empty_install_dir="${tmp_dir}/empty-installation"
bash "$NODE_SCRIPT" \
  --core-url https://admin.example.test \
  --enroll-token enrollment-secret \
  --agent-token agent-secret \
  --agent-image ghcr.io/example/perum-core:git-111111111111 \
  --tenant-image ghcr.io/example/perum-tenant:git-222222222222 \
  --web-image ghcr.io/example/perum-web:git-333333333333 \
  --dir "$empty_install_dir" \
  --no-docker \
  --dry-run >/dev/null
[[ ! -e "$empty_install_dir" ]] || fail "node dry-run created an installation path"
[[ "$output" == *"AGENT_IMAGE=ghcr.io/example/perum-core:git-111111111111"* ]] \
  || fail "explicit agent image was not used"
[[ "$output" == *"WEB_IMAGE=ghcr.io/example/perum-web:git-333333333333"* ]] \
  || fail "explicit web image was not used"
[[ "$output" == *"TENANT_IMAGE=ghcr.io/example/perum-tenant:git-bbbbbbbbbbbb"* ]] \
  || fail "persisted tenant image fallback was not used"
[[ "$output" == *"AGENT_TOKEN=persisted-agent-secret"* ]] \
  || fail "persisted agent secret was not preserved"
[[ "$output" == *"cd '${install_dir}' && docker compose config -q"* ]] \
  || fail "node compose config does not run from INSTALL_DIR in dry-run"

mock_bin="${tmp_dir}/bin"
real_install_dir="${tmp_dir}/real-installation"
docker_log="${tmp_dir}/docker.log"
mkdir -p "$mock_bin"
cat > "${mock_bin}/docker" <<'EOF'
#!/usr/bin/env bash
printf '%s|%s\n' "$PWD" "$*" >> "$DOCKER_LOG"
exit 0
EOF
cat > "${mock_bin}/curl" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
cat > "${mock_bin}/sudo" <<'EOF'
#!/usr/bin/env bash
[[ "${1:-}" == "-n" ]] && shift
exec "$@"
EOF
chmod +x "${mock_bin}/docker" "${mock_bin}/curl" "${mock_bin}/sudo"
PATH="${mock_bin}:${PATH}" DOCKER_LOG="$docker_log" bash "$NODE_SCRIPT" \
  --core-url https://admin.example.test \
  --enroll-token enrollment-secret \
  --agent-token agent-secret \
  --agent-image ghcr.io/example/perum-core:git-111111111111 \
  --tenant-image ghcr.io/example/perum-tenant:git-222222222222 \
  --web-image ghcr.io/example/perum-web:git-333333333333 \
  --dir "$real_install_dir" \
  --no-docker >/dev/null
assert_contains "$docker_log" "${real_install_dir}|compose config -q"

assert_contains "$COMPOSE_FILE" 'AGENT_IMAGE: ${AGENT_IMAGE:-}'
assert_contains "$COMPOSE_FILE" 'WEB_IMAGE: ${WEB_IMAGE:-perum-web:dev}'
assert_contains "$ENV_EXAMPLE" 'AGENT_IMAGE=ghcr.io/syb1v/perum-core:git-<sha12>'
assert_contains "$CORE_SCRIPT" 'up -d --pull never --force-recreate perum_core perum_web'
assert_contains "$CORE_SCRIPT" 'PREVIOUS_COMMIT=$(git -C "${DEPLOY_PATH}" rev-parse HEAD)'
assert_contains "$CORE_SCRIPT" "git checkout --detach '\${PREVIOUS_COMMIT}'"
assert_contains "$CORE_SCRIPT" 'CORE_IMAGE=${PREVIOUS_CORE_RUNTIME_IMAGE} AGENT_IMAGE=${PREVIOUS_AGENT_IMAGE} WEB_IMAGE=${PREVIOUS_WEB_RUNTIME_IMAGE}'
assert_contains "$CORE_SCRIPT" "docker inspect --format '{{.State.Health.Status}}' perum_web"
assert_contains "$CORE_SCRIPT" 'AGENT_IMAGE="$CORE_IMAGE"'
assert_contains "$CORE_SCRIPT" "'s|^AGENT_IMAGE=.*|AGENT_IMAGE=\${AGENT_IMAGE}|'"
assert_contains "$CORE_SCRIPT" 'trap rollback_update ERR'
assert_contains "$CORE_SCRIPT" "trap 'rollback_update 130' INT"
assert_contains "$CORE_SCRIPT" "trap 'rollback_update 143' TERM"
assert_contains "$CORE_SCRIPT" 'trap - ERR INT TERM'
assert_contains "$CORE_SCRIPT" 'cp --preserve=mode,ownership,timestamps "$ROLLBACK_ENV_BACKUP" "${DEPLOY_PATH}/deploy/.env.prod"'
assert_contains "$CORE_SCRIPT" 'wait_for_app_readiness || rollback_failed=true'

checkout_line=$(grep -nF "git checkout --detach '\${PREVIOUS_COMMIT}'" "$CORE_SCRIPT" | cut -d: -f1)
rollback_line=$(grep -nF 'ROLLBACK_COMPOSE=' "$CORE_SCRIPT" | cut -d: -f1)
[[ -n "$checkout_line" && -n "$rollback_line" && "$checkout_line" -lt "$rollback_line" ]] \
  || fail "rollback compose is prepared before the previous checkout is restored"

target_checkout_line=$(grep -nF 'git checkout --detach ${COMMIT}' "$CORE_SCRIPT" | cut -d: -f1)
rollback_armed_line=$(grep -nF 'ROLLBACK_ACTIVE=true' "$CORE_SCRIPT" | cut -d: -f1)
[[ -n "$target_checkout_line" && -n "$rollback_armed_line" && "$target_checkout_line" -lt "$rollback_armed_line" ]] \
  || fail "rollback is armed before target checkout completes"

assert_contains "$RELEASE_WORKFLOW" 'CORE_IMAGE="$(docker inspect -f '\''{{.Config.Image}}'\'' perum_core 2>/dev/null)"'
assert_contains "$RELEASE_WORKFLOW" '[[ "$image" =~ @sha256:[0-9a-fA-F]{64}$ || "$image" =~ :git-[0-9a-fA-F]{12,}$ ]]'
assert_contains "$RELEASE_WORKFLOW" 'bash "${DEPLOY_PATH}/deploy/scripts/deploy-core.sh" \'
assert_contains "$RELEASE_WORKFLOW" '--update \'
assert_contains "$RELEASE_WORKFLOW" '--commit "$RELEASE_SHA" \'
assert_contains "$RELEASE_WORKFLOW" '--core-image "$CORE_IMAGE" \'
assert_contains "$RELEASE_WORKFLOW" '--web-image "$WEB_IMAGE" \'
assert_contains "$RELEASE_WORKFLOW" '--path "$DEPLOY_PATH"'
assert_not_contains "$RELEASE_WORKFLOW" 'git checkout --detach "$RELEASE_SHA"'
assert_not_contains "$RELEASE_WORKFLOW" 'docker image prune -f'

printf 'deploy script checks passed\n'
