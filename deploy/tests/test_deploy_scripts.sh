#!/usr/bin/env bash

set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
NODE_SCRIPT="${ROOT}/deploy/scripts/deploy-node.sh"
CORE_SCRIPT="${ROOT}/deploy/scripts/deploy-core.sh"
RELEASE_WORKFLOW="${ROOT}/.github/workflows/release.yml"
TLS_TRANSITION_WORKFLOW="${ROOT}/.github/workflows/production-node-agent-tls-transition.yml"
CI_WORKFLOW="${ROOT}/.github/workflows/ci.yml"
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

assert_count() {
  local file="$1" text="$2" expected="$3" actual
  actual=$(grep -Fc -- "$text" "$file" || true)
  [[ "$actual" == "$expected" ]] || fail "${file} contains ${actual}, expected ${expected}: ${text}"
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
assert_contains "$COMPOSE_FILE" 'image: ${CORE_RUNTIME_IMAGE:-${CORE_IMAGE:-perum-core:dev}}'
assert_contains "$COMPOSE_FILE" 'image: ${WEB_RUNTIME_IMAGE:-${WEB_IMAGE:-perum-web:dev}}'
assert_contains "$ENV_EXAMPLE" 'AGENT_IMAGE=ghcr.io/syb1v/perum-core:git-<sha12>'
assert_not_contains "$ENV_EXAMPLE" 'CORE_RUNTIME_IMAGE='
assert_not_contains "$ENV_EXAMPLE" 'WEB_RUNTIME_IMAGE='
assert_contains "$CORE_SCRIPT" 'up -d --pull never --force-recreate perum_core perum_web'
assert_contains "$CORE_SCRIPT" 'PREVIOUS_COMMIT=$(git -C "${DEPLOY_PATH}" rev-parse HEAD)'
assert_contains "$CORE_SCRIPT" "git checkout --detach '\${PREVIOUS_COMMIT}'"
assert_contains "$CORE_SCRIPT" 'CORE_RUNTIME_IMAGE=${PREVIOUS_CORE_RUNTIME_IMAGE} WEB_RUNTIME_IMAGE=${PREVIOUS_WEB_RUNTIME_IMAGE}'
assert_contains "$CORE_SCRIPT" "docker inspect --format '{{.State.Health.Status}}' perum_web"
assert_contains "$CORE_SCRIPT" 'AGENT_IMAGE="$CORE_IMAGE"'
assert_contains "$CORE_SCRIPT" "'s|^AGENT_IMAGE=.*|AGENT_IMAGE=\${agent_image}|'"
assert_contains "$CORE_SCRIPT" 'trap rollback_update ERR'
assert_contains "$CORE_SCRIPT" "trap 'rollback_update 130' INT"
assert_contains "$CORE_SCRIPT" "trap 'rollback_update 143' TERM"
assert_contains "$CORE_SCRIPT" 'trap - ERR INT TERM'
assert_contains "$CORE_SCRIPT" 'cp --preserve=mode,ownership,timestamps "$ROLLBACK_ENV_BACKUP" "${DEPLOY_PATH}/deploy/.env.prod"'
assert_contains "$CORE_SCRIPT" 'wait_for_app_readiness || rollback_failed=true'
assert_contains "$CORE_SCRIPT" 'require_deploy_disk_headroom'
assert_contains "$CORE_SCRIPT" 'MIN_DEPLOY_FREE_KB=$((5 * 1024 * 1024))'
assert_contains "$CORE_SCRIPT" 'PREVIOUS_CORE_DB_REVISION=$(read_core_revision "$COMPOSE_PREFLIGHT")'
assert_contains "$CORE_SCRIPT" '[[ "$command_status" -eq 0 ]] || return 1'
assert_contains "$CORE_SCRIPT" '[[ "${#lines[@]}" -eq 1 ]] || return 1'
assert_contains "$CORE_SCRIPT" '[[ "$output" =~ ^[[:space:]]*$ ]]'
assert_contains "$CORE_SCRIPT" "run \"\${COMPOSE_UPDATE} run --rm --no-deps perum_core alembic downgrade '\${PREVIOUS_CORE_DB_REVISION}'\""
assert_contains "$CORE_SCRIPT" 'RECOVERY FAILURE: downgrade Core DB не подтверждён; старый Core не будет запущен'

checkout_line=$(grep -nF "git checkout --detach '\${PREVIOUS_COMMIT}'" "$CORE_SCRIPT" | tail -1 | cut -d: -f1)
rollback_line=$(grep -nF 'ROLLBACK_COMPOSE=' "$CORE_SCRIPT" | cut -d: -f1)
[[ -n "$checkout_line" && -n "$rollback_line" && "$rollback_line" -lt "$checkout_line" ]] \
  || fail "previous checkout is restored before runtime-aware rollback compose"

target_checkout_line=$(grep -nF 'git checkout --detach ${COMMIT}' "$CORE_SCRIPT" | cut -d: -f1)
rollback_armed_line=$(grep -nF 'ROLLBACK_ACTIVE=true' "$CORE_SCRIPT" | cut -d: -f1)
[[ -n "$target_checkout_line" && -n "$rollback_armed_line" && "$rollback_armed_line" -lt "$target_checkout_line" ]] \
  || fail "rollback is not armed before target checkout"

assert_contains "$RELEASE_WORKFLOW" 'CORE_RUNTIME_IMAGE="$(docker inspect -f '\''{{.Image}}'\'' perum_core 2>/dev/null)"'
assert_contains "$RELEASE_WORKFLOW" 'uses: actions/upload-artifact@v4'
assert_contains "$RELEASE_WORKFLOW" 'uses: actions/download-artifact@v4'
assert_contains "$RELEASE_WORKFLOW" 'core_ref="ghcr.io/${OWNER}/perum-core@${digest}"'
assert_contains "$RELEASE_WORKFLOW" 'web_ref="ghcr.io/${OWNER}/perum-web@${digest}"'
assert_contains "$RELEASE_WORKFLOW" 'deploy_args+=(--core-runtime-image "$CORE_RUNTIME_IMAGE")'
assert_contains "$CI_WORKFLOW" 'run: bash deploy/tests/test_deploy_scripts.sh'
assert_contains "$RELEASE_WORKFLOW" 'bash "${DEPLOY_PATH}/deploy/scripts/deploy-core.sh" "${deploy_args[@]}"'
assert_contains "$RELEASE_WORKFLOW" 'deploy_args=('
assert_contains "$RELEASE_WORKFLOW" '--commit "$RELEASE_SHA"'
assert_contains "$RELEASE_WORKFLOW" '--core-image "$CORE_IMAGE"'
assert_contains "$RELEASE_WORKFLOW" '--web-image "$WEB_IMAGE"'
assert_contains "$RELEASE_WORKFLOW" '--path "$DEPLOY_PATH"'
assert_not_contains "$RELEASE_WORKFLOW" 'git checkout --detach "$RELEASE_SHA"'
assert_not_contains "$RELEASE_WORKFLOW" 'docker image prune -f'
assert_contains "$RELEASE_WORKFLOW" 'host: ${{ vars.DEPLOY_SSH_HOST }}'
assert_contains "$RELEASE_WORKFLOW" 'username: ${{ vars.DEPLOY_SSH_USER }}'
assert_contains "$RELEASE_WORKFLOW" 'port: ${{ vars.DEPLOY_SSH_PORT || 22 }}'
assert_contains "$RELEASE_WORKFLOW" 'DEPLOY_PATH="${{ vars.DEPLOY_PATH }}"'
assert_not_contains "$RELEASE_WORKFLOW" "vars.DEPLOY_PATH || '/opt/perum'"
assert_not_contains "$RELEASE_WORKFLOW" 'secrets.DEPLOY_SSH_HOST'
assert_not_contains "$RELEASE_WORKFLOW" 'secrets.DEPLOY_PATH'
assert_contains "$RELEASE_WORKFLOW" 'Missing production deploy configuration:'
assert_contains "$RELEASE_WORKFLOW" 'AGENT_LEGACY_HTTP_DEADLINE: ${{ vars.AGENT_LEGACY_HTTP_DEADLINE }}'
assert_contains "$RELEASE_WORKFLOW" 'WEB_ROLLOUT_LEGACY_DEADLINE: ${{ vars.WEB_ROLLOUT_LEGACY_DEADLINE }}'
assert_contains "$RELEASE_WORKFLOW" '/api/ci/deployment/preflight'
assert_contains "$RELEASE_WORKFLOW" 'Configure host/user/path as production environment variables and only the SSH key as a production environment secret.'
assert_not_contains "$RELEASE_WORKFLOW" 'break_glass'
assert_contains "$RELEASE_WORKFLOW" '[ "$DEPLOY_RESULT" = success ]'
assert_contains "$RELEASE_WORKFLOW" "[ -n \"\$CORE_URL\" ]"
assert_contains "$RELEASE_WORKFLOW" "[ -n \"\$TOKEN\" ]"
assert_contains "$TLS_TRANSITION_WORKFLOW" 'environment: production'
assert_contains "$TLS_TRANSITION_WORKFLOW" 'No successful CI for $RELEASE_SHA.'
assert_contains "$TLS_TRANSITION_WORKFLOW" 'release_sha must equal the current main SHA.'
assert_contains "$TLS_TRANSITION_WORKFLOW" 'No successful exact-SHA CI build for $RELEASE_SHA.'
assert_contains "$TLS_TRANSITION_WORKFLOW" 'agent-transition-provenance'
assert_not_contains "$TLS_TRANSITION_WORKFLOW" 'actions/workflows/release.yml/runs'
assert_contains "$TLS_TRANSITION_WORKFLOW" 'NODE_TLS_PROVISIONED_DIR'
assert_contains "$TLS_TRANSITION_WORKFLOW" 'NODE_SSH_KNOWN_HOSTS'
assert_contains "$TLS_TRANSITION_WORKFLOW" 'alembic upgrade head'
assert_contains "$TLS_TRANSITION_WORKFLOW" 'alembic downgrade "$old_revision"'
assert_contains "$TLS_TRANSITION_WORKFLOW" 'Refusing to restart old Agent against an unknown DB revision.'
assert_contains "$TLS_TRANSITION_WORKFLOW" 'Core transition state is pending or unavailable.'
assert_contains "$TLS_TRANSITION_WORKFLOW" '/api/ci/node-transport/transitions/${transition_id}'
assert_contains "$TLS_TRANSITION_WORKFLOW" '--cacert "$ca"'
assert_contains "$TLS_TRANSITION_WORKFLOW" 'Legacy HTTP management port remains reachable after committed transition.'
assert_contains "$TLS_TRANSITION_WORKFLOW" 'transport:"https_v1"'
assert_contains "$TLS_TRANSITION_WORKFLOW" 'web_rollout_version == "web_rollout_v1"'
assert_contains "$TLS_TRANSITION_WORKFLOW" '.tls-transition-rollback'
assert_contains "$TLS_TRANSITION_WORKFLOW" 'rollback_remote'
assert_contains "$TLS_TRANSITION_WORKFLOW" 'perum_agent.image-id'
assert_contains "$TLS_TRANSITION_WORKFLOW" 'caddy.image-id'
assert_contains "$TLS_TRANSITION_WORKFLOW" 'docker-compose.rollback.yml'
assert_contains "$TLS_TRANSITION_WORKFLOW" 'docker image inspect "$image_id"'
assert_contains "$TLS_TRANSITION_WORKFLOW" "docker image inspect -f '{{.Id}}' \"\$agent_image\""
assert_contains "$TLS_TRANSITION_WORKFLOW" 'docker inspect -f '\''{{.Image}}'\'' perum_agent)" = "$candidate_image_id"'
assert_contains "$TLS_TRANSITION_WORKFLOW" '/api/agent/capabilities'
assert_contains "$TLS_TRANSITION_WORKFLOW" 'Transition did not commit; node rollback was verified.'
assert_contains "$TLS_TRANSITION_WORKFLOW" 'node rollback verification failed; rollback material was retained.'
assert_contains "$TLS_TRANSITION_WORKFLOW" 'state=unknown'
assert_contains "$TLS_TRANSITION_WORKFLOW" 'transition_id must be a canonical lowercase UUID.'
assert_contains "$TLS_TRANSITION_WORKFLOW" '.phase == "rejected"'
assert_not_contains "$TLS_TRANSITION_WORKFLOW" '.phase == "pending" or .phase == "rejected"'
assert_not_contains "$TLS_TRANSITION_WORKFLOW" 'docker-compose.transition.yml'
assert_not_contains "$TLS_TRANSITION_WORKFLOW" 'Caddyfile.transition'
assert_not_contains "$TLS_TRANSITION_WORKFLOW" '-H "Authorization: Bearer $token" "http://'
assert_contains "$TLS_TRANSITION_WORKFLOW" 'Candidate remains HTTPS-only and rollback materials are retained'
assert_contains "$TLS_TRANSITION_WORKFLOW" 'TRANSPORT_UNCERTAIN=true'
assert_contains "$TLS_TRANSITION_WORKFLOW" 'Mutation state is not safely determinable.'
assert_contains "$TLS_TRANSITION_WORKFLOW" 'RECEIPT_PROTECTED=true'
assert_contains "$TLS_TRANSITION_WORKFLOW" 'ROLLBACK_AUTHORIZATION=none'
assert_contains "$TLS_TRANSITION_WORKFLOW" 'Remote rollback denied without authoritative rejected/no-receipt proof.'
assert_contains "$TLS_TRANSITION_WORKFLOW" 'Core receipt is unavailable or ambiguous; refusing SSH mutation or rollback.'
assert_contains "$TLS_TRANSITION_WORKFLOW" 'Core receipt could not authoritatively prove no receipt after SSH disconnect.'
assert_contains "$TLS_TRANSITION_WORKFLOW" 'candidate-ready > "$rollback/phase"'
tls_handler_line=$(grep -nF 'transition_failed() {' "$TLS_TRANSITION_WORKFLOW" | cut -d: -f1)
tls_mutation_line=$(grep -nF 'scp "${scp_opts[@]}" docker-compose.yml' "$TLS_TRANSITION_WORKFLOW" | cut -d: -f1)
[[ -n "$tls_handler_line" && -n "$tls_mutation_line" && "$tls_handler_line" -lt "$tls_mutation_line" ]] \
  || fail "TLS recovery handler is not defined before candidate mutation"
tls_receipt_line=$(grep -nF 'query_receipt_state' "$TLS_TRANSITION_WORKFLOW" | tail -2 | head -1 | cut -d: -f1)
[[ -n "$tls_receipt_line" && "$tls_receipt_line" -lt "$tls_mutation_line" ]] \
  || fail "TLS receipt is not queried before candidate mutation"

mock_tls_disconnect_policy() {
  local receipt_state="$1" phase="$2" ssh_status="$3" rollback=false protected=false
  case "$receipt_state" in
    pending|committed) protected=true ;;
    rejected) [[ "$phase" == candidate-ready ]] && rollback=true ;;
    no-receipt) [[ "$ssh_status" != 255 ]] && rollback=true ;;
  esac
  [[ "$protected" == true ]] && rollback=false
  printf '%s' "$rollback"
}
[[ "$(mock_tls_disconnect_policy committed candidate-ready 255)" == false ]] \
  || fail "resumed committed candidate-ready SSH 255 permits rollback"
[[ "$(mock_tls_disconnect_policy pending candidate-ready 255)" == false ]] \
  || fail "resumed pending candidate-ready SSH 255 permits rollback"
assert_contains "$CI_WORKFLOW" 'name: agent-transition-provenance'
assert_contains "$CI_WORKFLOW" 'agent-transition-${{ github.sha }}'

core_mock_bin="${tmp_dir}/core-bin"
core_deploy_dir="${tmp_dir}/core-deploy"
core_docker_log="${tmp_dir}/core-docker.log"
core_git_log="${tmp_dir}/core-git.log"
core_event_log="${tmp_dir}/core-events.log"
core_local_images="${tmp_dir}/core-local-images"
core_image_map="${tmp_dir}/core-image-map"
core_container_core="${tmp_dir}/core-container-core"
core_container_web="${tmp_dir}/core-container-web"
core_db_revision="${tmp_dir}/core-db-revision"
mkdir -p "$core_mock_bin" "${core_deploy_dir}/deploy"
cat > "${core_mock_bin}/git" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$CORE_GIT_LOG"
printf 'git|%s\n' "$*" >> "$CORE_EVENT_LOG"
if [[ "$*" == *"rev-parse HEAD"* ]]; then
  printf '%s\n' '1111111111111111111111111111111111111111'
fi
if [[ "$*" == *"checkout --detach 2222222222222222222222222222222222222222"* && "${FAIL_TARGET_CHECKOUT:-false}" == true ]]; then
  exit 1
fi
exit 0
EOF
cat > "${core_mock_bin}/docker" <<'EOF'
#!/usr/bin/env bash
printf '%s|%s|%s|%s|%s|%s\n' "${CORE_IMAGE:-}" "${AGENT_IMAGE:-}" "${WEB_IMAGE:-}" "${CORE_RUNTIME_IMAGE:-}" "${WEB_RUNTIME_IMAGE:-}" "$*" >> "$CORE_DOCKER_LOG"
printf 'docker|%s|%s|%s\n' "${CORE_RUNTIME_IMAGE:-}" "${WEB_RUNTIME_IMAGE:-}" "$*" >> "$CORE_EVENT_LOG"
if [[ "${1:-}" == "image" && "${2:-}" == "inspect" ]]; then
  ref="${@: -1}"
  grep -Fxq -- "$ref" "$CORE_LOCAL_IMAGES" || exit 1
  if [[ "$*" == *"{{.Id}}"* ]]; then
    id=$(while IFS='|' read -r mapped_ref mapped_id; do [[ "$mapped_ref" == "$ref" ]] && { printf '%s' "$mapped_id"; break; }; done < "$CORE_IMAGE_MAP")
    [[ -n "$id" ]] || exit 1
    printf '%s\n' "$id"
  fi
  exit 0
fi
if [[ "${1:-}" == "pull" ]]; then
  grep -Fq -- "${2:-}|" "$CORE_IMAGE_MAP" || exit 1
  grep -Fxq -- "${2:-}" "$CORE_LOCAL_IMAGES" || printf '%s\n' "${2:-}" >> "$CORE_LOCAL_IMAGES"
  exit 0
fi
if [[ "${1:-}" == "inspect" ]]; then
  if [[ "$*" == *".State.Health.Status"* ]]; then
    printf '%s\n' healthy
  elif [[ "$*" == *".Image"* && "$*" == *"perum_core"* ]]; then
    cat "$CORE_CONTAINER_CORE"
  elif [[ "$*" == *".Image"* && "$*" == *"perum_web"* ]]; then
    cat "$CORE_CONTAINER_WEB"
  elif [[ "$*" == *".Config.Image"* && "$*" == *"perum_core"* ]]; then
    cat "$CORE_CONTAINER_CORE"
  elif [[ "$*" == *".Config.Image"* && "$*" == *"perum_web"* ]]; then
    cat "$CORE_CONTAINER_WEB"
  fi
  exit 0
fi
if [[ "${1:-}" == "compose" && "$*" == *" up "* ]]; then
  core_target="${CORE_RUNTIME_IMAGE:-$CORE_IMAGE}"
  web_target="${WEB_RUNTIME_IMAGE:-$WEB_IMAGE}"
  if [[ "${MISMATCH_TARGET:-false}" == true && "$core_target" == sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee ]]; then
    printf '%s\n' sha256:999999999999999999999999999999999999999999999999999999999999 > "$CORE_CONTAINER_CORE"
  else
    printf '%s\n' "$core_target" > "$CORE_CONTAINER_CORE"
  fi
  printf '%s\n' "$web_target" > "$CORE_CONTAINER_WEB"
  if [[ "$core_target" == sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee ]]; then
    printf '%s\n' 0040_node_transport_receipts > "$CORE_DB_REVISION"
  fi
fi
if [[ "${1:-}" == "compose" && "$*" == *"alembic current"* ]]; then
  if [[ "${CORE_REVISION_STATUS:-0}" -ne 0 ]]; then
    printf '%s' "${CORE_REVISION_OUTPUT:-}"
    exit "$CORE_REVISION_STATUS"
  fi
  if [[ "${CORE_REVISION_OUTPUT:-__unset__}" == __empty__ ]]; then
    :
  elif [[ "${CORE_REVISION_OUTPUT:-__unset__}" != __unset__ ]]; then
    printf '%s' "$CORE_REVISION_OUTPUT"
  else
    cat "$CORE_DB_REVISION"
  fi
fi
if [[ "${1:-}" == "compose" && "$*" == *"alembic show"* ]]; then
  exit 0
fi
if [[ "${1:-}" == "compose" && "$*" == *"alembic downgrade"* ]]; then
  [[ "${FAIL_CORE_DOWNGRADE:-false}" != true ]] || exit 1
  printf '%s\n' 0039_node_web_rollout > "$CORE_DB_REVISION"
fi
exit 0
EOF
cat > "${core_mock_bin}/sudo" <<'EOF'
#!/usr/bin/env bash
[[ "${1:-}" == "-n" ]] && exit 0
exec "$@"
EOF
chmod +x "${core_mock_bin}/git" "${core_mock_bin}/docker" "${core_mock_bin}/sudo"

PREVIOUS_CORE_ID=sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc
PREVIOUS_WEB_ID=sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd
TARGET_CORE_ID=sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee
TARGET_WEB_ID=sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff
CORE_TAG=ghcr.io/example/perum-core:git-cccccccccccc
WEB_TAG=ghcr.io/example/perum-web:git-dddddddddddd
CORE_DIGEST=ghcr.io/example/perum-core@sha256:1111111111111111111111111111111111111111111111111111111111111111
WEB_DIGEST=ghcr.io/example/perum-web@sha256:2222222222222222222222222222222222222222222222222222222222222222
cat > "$core_image_map" <<EOF
$PREVIOUS_CORE_ID|$PREVIOUS_CORE_ID
$PREVIOUS_WEB_ID|$PREVIOUS_WEB_ID
$TARGET_CORE_ID|$TARGET_CORE_ID
$TARGET_WEB_ID|$TARGET_WEB_ID
$CORE_TAG|$TARGET_CORE_ID
$WEB_TAG|$TARGET_WEB_ID
$CORE_DIGEST|$TARGET_CORE_ID
$WEB_DIGEST|$TARGET_WEB_ID
EOF

reset_core_state() {
  cat > "${core_deploy_dir}/deploy/.env.prod" <<EOF
CORE_IMAGE=ghcr.io/example/perum-core:git-aaaaaaaaaaaa
AGENT_IMAGE=ghcr.io/example/perum-core:git-aaaaaaaaaaaa
WEB_IMAGE=ghcr.io/example/perum-web:git-bbbbbbbbbbbb
PUBLIC_BASE_DOMAIN=example.test
AGENT_LEGACY_HTTP_DEADLINE=2099-01-01T00:00:00Z
WEB_ROLLOUT_LEGACY_DEADLINE=2099-01-01T00:00:00Z
EOF
  printf '%s\n' "$PREVIOUS_CORE_ID" > "$core_container_core"
  printf '%s\n' "$PREVIOUS_WEB_ID" > "$core_container_web"
  printf '%s\n' 0039_node_web_rollout > "$core_db_revision"
  printf '%s\n' "$PREVIOUS_CORE_ID" "$PREVIOUS_WEB_ID" > "$core_local_images"
  : > "$core_docker_log"
  : > "$core_git_log"
  : > "$core_event_log"
}

run_core_update() {
  PATH="${core_mock_bin}:${PATH}" \
    CORE_DOCKER_LOG="$core_docker_log" CORE_GIT_LOG="$core_git_log" \
    CORE_EVENT_LOG="$core_event_log" \
    CORE_LOCAL_IMAGES="$core_local_images" CORE_IMAGE_MAP="$core_image_map" \
    CORE_CONTAINER_CORE="$core_container_core" CORE_CONTAINER_WEB="$core_container_web" \
    CORE_DB_REVISION="$core_db_revision" FAIL_CORE_DOWNGRADE="${FAIL_CORE_DOWNGRADE:-false}" \
    CORE_REVISION_OUTPUT="${CORE_REVISION_OUTPUT-__unset__}" CORE_REVISION_STATUS="${CORE_REVISION_STATUS:-0}" \
    MISMATCH_TARGET="${MISMATCH_TARGET:-false}" FAIL_TARGET_CHECKOUT="${FAIL_TARGET_CHECKOUT:-false}" \
    PERUM_DEPLOY_LOCKED=1 bash "$CORE_SCRIPT" --update \
      --commit 2222222222222222222222222222222222222222 \
      --path "$core_deploy_dir" "$@" >/dev/null 2>&1
}

reset_core_state
if CORE_REVISION_OUTPUT='warning: noisy output' run_core_update --core-image "$CORE_DIGEST" --web-image "$WEB_DIGEST"; then
  fail "core update accepted malformed nonempty Alembic output"
fi
assert_count "$core_git_log" 'checkout --detach 2222222222222222222222222222222222222222' 0

reset_core_state
if CORE_REVISION_OUTPUT=$'0039_node_web_rollout (head)\n0040_node_transport_receipts (head)' run_core_update --core-image "$CORE_DIGEST" --web-image "$WEB_DIGEST"; then
  fail "core update accepted multiple Alembic heads"
fi
assert_count "$core_git_log" 'checkout --detach 2222222222222222222222222222222222222222' 0

reset_core_state
CORE_REVISION_OUTPUT=__empty__ run_core_update --core-image "$CORE_DIGEST" --web-image "$WEB_DIGEST"

reset_core_state
CORE_REVISION_OUTPUT='0039_node_web_rollout (head)' run_core_update --core-image "$CORE_DIGEST" --web-image "$WEB_DIGEST"

reset_core_state
if CORE_REVISION_OUTPUT='0039_node_web_rollout (head)' CORE_REVISION_STATUS=1 run_core_update --core-image "$CORE_DIGEST" --web-image "$WEB_DIGEST"; then
  fail "core update accepted failed Alembic current command"
fi
assert_count "$core_git_log" 'checkout --detach 2222222222222222222222222222222222222222' 0

reset_core_state
printf '%s\n' "$TARGET_CORE_ID" "$TARGET_WEB_ID" >> "$core_local_images"
run_core_update --pull-never --core-image "$CORE_TAG" --web-image "$WEB_TAG" \
  --core-runtime-image "$TARGET_CORE_ID" --web-runtime-image "$TARGET_WEB_ID"
assert_count "$core_docker_log" "pull $TARGET_CORE_ID" 0
assert_count "$core_docker_log" "pull $TARGET_WEB_ID" 0
assert_contains "$core_docker_log" "$CORE_TAG|$CORE_TAG|$WEB_TAG|$TARGET_CORE_ID|$TARGET_WEB_ID|compose"
assert_contains "${core_deploy_dir}/deploy/.env.prod" "CORE_IMAGE=$CORE_TAG"
assert_contains "${core_deploy_dir}/deploy/.env.prod" "AGENT_IMAGE=$CORE_TAG"
assert_contains "${core_deploy_dir}/deploy/.env.prod" "WEB_IMAGE=$WEB_TAG"
assert_not_contains "${core_deploy_dir}/deploy/.env.prod" 'RUNTIME_IMAGE='

reset_core_state
printf '%s\n' "$CORE_TAG" "$WEB_TAG" >> "$core_local_images"
run_core_update --core-image "$CORE_TAG" --web-image "$WEB_TAG"
assert_count "$core_docker_log" "pull $CORE_TAG" 1
assert_count "$core_docker_log" "pull $WEB_TAG" 1
assert_contains "$core_docker_log" "$CORE_TAG|$CORE_TAG|$WEB_TAG|$TARGET_CORE_ID|$TARGET_WEB_ID|compose"

reset_core_state
if run_core_update --pull-never --core-image "$CORE_TAG" --web-image "$WEB_TAG"; then
  fail "core --pull-never accepted git tags"
fi
assert_count "$core_docker_log" "pull $CORE_TAG" 0
assert_count "$core_docker_log" "pull $WEB_TAG" 0

reset_core_state
printf '%s\n' "$CORE_DIGEST" "$WEB_DIGEST" >> "$core_local_images"
run_core_update --core-image "$CORE_DIGEST" --web-image "$WEB_DIGEST"
assert_count "$core_docker_log" "pull $CORE_DIGEST" 0
assert_count "$core_docker_log" "pull $WEB_DIGEST" 0

reset_core_state
printf '%s\n' "$CORE_DIGEST" "$WEB_DIGEST" >> "$core_local_images"
run_core_update --pull-never --core-image "$CORE_DIGEST" --web-image "$WEB_DIGEST"
assert_count "$core_docker_log" "pull $CORE_DIGEST" 0
assert_count "$core_docker_log" "pull $WEB_DIGEST" 0

reset_core_state
if run_core_update --pull-never --core-image "$CORE_DIGEST" --web-image "$WEB_DIGEST"; then
  fail "core --pull-never accepted missing digest refs"
fi
assert_count "$core_docker_log" "pull $CORE_DIGEST" 0
assert_count "$core_docker_log" "pull $WEB_DIGEST" 0

reset_core_state
run_core_update --core-image "$CORE_DIGEST" --web-image "$WEB_DIGEST"
assert_count "$core_docker_log" "pull $CORE_DIGEST" 1
assert_count "$core_docker_log" "pull $WEB_DIGEST" 1

reset_core_state
if run_core_update --core-image ghcr.io/example/perum-core:latest --web-image "$WEB_TAG"; then
  fail "core update accepted a mutable image ref"
fi
[[ ! -s "$core_docker_log" ]] || fail "mutable image ref reached Docker preflight"

reset_core_state
if MISMATCH_TARGET=true run_core_update --core-image "$CORE_TAG" --web-image "$WEB_TAG"; then
  fail "core update accepted a mismatched runtime image"
fi
assert_contains "$core_git_log" 'checkout --detach 1111111111111111111111111111111111111111'
assert_contains "${core_deploy_dir}/deploy/.env.prod" 'CORE_IMAGE=ghcr.io/example/perum-core:git-aaaaaaaaaaaa'
assert_contains "${core_deploy_dir}/deploy/.env.prod" 'AGENT_IMAGE=ghcr.io/example/perum-core:git-aaaaaaaaaaaa'
assert_contains "${core_deploy_dir}/deploy/.env.prod" 'WEB_IMAGE=ghcr.io/example/perum-web:git-bbbbbbbbbbbb'
[[ "$(<"$core_container_core")" == "$PREVIOUS_CORE_ID" ]] || fail "rollback did not restore Core runtime ID"
[[ "$(<"$core_container_web")" == "$PREVIOUS_WEB_ID" ]] || fail "rollback did not restore Web runtime ID"
assert_count "$core_docker_log" 'up -d --pull never --force-recreate perum_core perum_web' 2
downgrade_line=$(grep -nF 'alembic downgrade 0039_node_web_rollout' "$core_event_log" | cut -d: -f1)
rollback_up_line=$(grep -nF "docker|$PREVIOUS_CORE_ID|$PREVIOUS_WEB_ID|compose" "$core_event_log" | tail -1 | cut -d: -f1)
previous_checkout_line=$(grep -nF 'checkout --detach 1111111111111111111111111111111111111111' "$core_event_log" | tail -1 | cut -d: -f1)
[[ -n "$downgrade_line" && -n "$rollback_up_line" && "$downgrade_line" -lt "$rollback_up_line" ]] \
  || fail "Core DB downgrade was not verified before historical Core startup"
[[ -n "$rollback_up_line" && -n "$previous_checkout_line" && "$rollback_up_line" -lt "$previous_checkout_line" ]] \
  || fail "rollback did not use target Compose before restoring previous checkout"

reset_core_state
printf '%s\n' "$CORE_TAG" "$WEB_TAG" >> "$core_local_images"
if FAIL_CORE_DOWNGRADE=true MISMATCH_TARGET=true run_core_update --core-image "$CORE_TAG" --web-image "$WEB_TAG"; then
  fail "core rollback accepted a failed schema downgrade"
fi
assert_count "$core_docker_log" 'up -d --pull never --force-recreate perum_core perum_web' 1
[[ "$(<"$core_container_core")" != "$PREVIOUS_CORE_ID" ]] || fail "old Core started after failed schema downgrade"

reset_core_state
if FAIL_TARGET_CHECKOUT=true run_core_update --core-image "$CORE_DIGEST" --web-image "$WEB_DIGEST"; then
  fail "core update accepted failed target checkout"
fi
assert_contains "$core_git_log" 'checkout --detach 1111111111111111111111111111111111111111'
assert_count "$core_docker_log" 'up -d --pull never --force-recreate perum_core perum_web' 0

install_digest_dir="${tmp_dir}/install-digest"
mkdir -p "${install_digest_dir}/deploy"
cat > "${install_digest_dir}/deploy/.env.prod" <<EOF
CORE_IMAGE=$CORE_DIGEST
AGENT_IMAGE=$CORE_DIGEST
WEB_IMAGE=$WEB_DIGEST
PUBLIC_BASE_DOMAIN=example.test
EOF
install_output=$(bash "$CORE_SCRIPT" --domain example.test --path "$install_digest_dir" \
  --no-docker --no-clone --skip-secrets --dry-run)
[[ "$install_output" == *"CORE_IMAGE=$CORE_DIGEST AGENT_IMAGE=$CORE_DIGEST WEB_IMAGE=$WEB_DIGEST CORE_RUNTIME_IMAGE=perum-core:local-build WEB_RUNTIME_IMAGE=perum-web:local-build docker compose"* ]] \
  || fail "install rerun did not separate portable digests from local build tags"
[[ "$install_output" == *"CORE_RUNTIME_IMAGE=perum-core:local-build WEB_RUNTIME_IMAGE=perum-web:local-build docker compose"*"build --no-cache --build-arg"* ]] \
  || fail "install rerun Web build did not target the stable local tag"

printf 'deploy script checks passed\n'
