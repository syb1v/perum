#!/usr/bin/env bash
set -euo pipefail
umask 077

CORE_BASE=${CORE_BASE:-http://admin.perum.local}
SCHOOL_A_BASE=${SCHOOL_A_BASE:-http://acme.perum.local}
SCHOOL_B_BASE=${SCHOOL_B_BASE:-http://demo1.perum.local}
CURL_RESOLVE=${CURL_RESOLVE:-acme.perum.local:80:127.0.0.1,demo1.perum.local:80:127.0.0.1}
CHECK_DOCKER_SILOS=${CHECK_DOCKER_SILOS:-0}
SCHOOL_LOGIN_PATH=${SCHOOL_LOGIN_PATH:-/api/login}
CORE_LOGIN_PATH=${CORE_LOGIN_PATH:-/api/auth/login}

: "${SCHOOL_A_LOGIN:?SCHOOL_A_LOGIN is required}"
: "${SCHOOL_A_PASSWORD:?SCHOOL_A_PASSWORD is required}"
: "${CORE_LOGIN:?CORE_LOGIN is required}"
: "${CORE_PASSWORD:?CORE_PASSWORD is required}"

tmp_dir=$(mktemp -d)
cleanup() {
  SCHOOL_TOKEN=
  CORE_TOKEN=
  rm -rf "$tmp_dir"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

curl_args=(--silent --show-error --connect-timeout "${CONNECT_TIMEOUT_SECONDS:-5}" --max-time "${REQUEST_TIMEOUT_SECONDS:-15}")
IFS=',' read -r -a resolve_entries <<< "$CURL_RESOLVE"
for entry in "${resolve_entries[@]}"; do
  if [[ -n "$entry" ]]; then
    curl_args+=(--resolve "$entry")
  fi
done

json_payload() {
  LOGIN_VALUE=$1 PASSWORD_VALUE=$2 python -c 'import json, os, sys; json.dump({"login": os.environ["LOGIN_VALUE"], "password": os.environ["PASSWORD_VALUE"]}, sys.stdout)'
}

login() {
  local base=$1
  local path=$2
  local login_value=$3
  local password_value=$4
  local token_field=$5
  local body_file=$6
  local payload_file="$tmp_dir/login.json"
  json_payload "$login_value" "$password_value" > "$payload_file"
  chmod 600 "$payload_file"
  local status
  status=$(curl "${curl_args[@]}" --output "$body_file" --write-out '%{http_code}' --request POST \
    --header 'Content-Type: application/json' --data-binary "@$payload_file" "$base$path")
  rm -f "$payload_file"
  if [[ "$status" != "200" ]]; then
    printf 'Login at %s failed: expected HTTP 200, got %s\n' "$base" "$status" >&2
    return 1
  fi
  TOKEN_FIELD="$token_field" python -c 'import json, os, sys; value = json.load(open(sys.argv[1], encoding="utf-8")).get(os.environ["TOKEN_FIELD"]); sys.stdout.write(value if isinstance(value, str) and value else "")' "$body_file"
}

assert_status() {
  local expected=$1
  local label=$2
  shift 2
  local status
  status=$(curl "${curl_args[@]}" --output /dev/null --write-out '%{http_code}' "$@")
  if [[ "$status" != "$expected" ]]; then
    printf '%s failed: expected HTTP %s, got %s\n' "$label" "$expected" "$status" >&2
    return 1
  fi
  printf 'PASS: %s returned HTTP %s\n' "$label" "$status"
}

SCHOOL_TOKEN=$(login "$SCHOOL_A_BASE" "$SCHOOL_LOGIN_PATH" "$SCHOOL_A_LOGIN" "$SCHOOL_A_PASSWORD" token "$tmp_dir/school-login.json")
if [[ -z "$SCHOOL_TOKEN" ]]; then
  printf 'School login response did not contain a token\n' >&2
  exit 1
fi

CORE_TOKEN=$(login "$CORE_BASE" "$CORE_LOGIN_PATH" "$CORE_LOGIN" "$CORE_PASSWORD" access_token "$tmp_dir/core-login.json")
if [[ -z "$CORE_TOKEN" ]]; then
  printf 'Core login response did not contain an access_token\n' >&2
  exit 1
fi

assert_status 401 'school token against another school' "$SCHOOL_B_BASE/api/admin/subjects" --header "Authorization: Bearer $SCHOOL_TOKEN"
assert_status 200 'school token against its own school' "$SCHOOL_A_BASE/api/admin/subjects" --header "Authorization: Bearer $SCHOOL_TOKEN"
assert_status 401 'platform token against a school' "$SCHOOL_A_BASE/api/admin/subjects" --header "Authorization: Bearer $CORE_TOKEN"
assert_status 401 'school token against the control plane' "$CORE_BASE/api/schools" --header "Authorization: Bearer $SCHOOL_TOKEN"

if [[ "$CHECK_DOCKER_SILOS" == "1" ]]; then
  SCHOOL_A_DB_CONTAINER=${SCHOOL_A_DB_CONTAINER:?SCHOOL_A_DB_CONTAINER is required when CHECK_DOCKER_SILOS=1}
  SCHOOL_B_DB_CONTAINER=${SCHOOL_B_DB_CONTAINER:?SCHOOL_B_DB_CONTAINER is required when CHECK_DOCKER_SILOS=1}
  DB_USER=${DB_USER:?DB_USER is required when CHECK_DOCKER_SILOS=1}
  DB_NAME=${DB_NAME:?DB_NAME is required when CHECK_DOCKER_SILOS=1}
  if [[ "$SCHOOL_A_DB_CONTAINER" == "$SCHOOL_B_DB_CONTAINER" ]]; then
    printf 'Docker silo containers must be distinct\n' >&2
    exit 1
  fi
  command -v docker >/dev/null
  docker exec "$SCHOOL_A_DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -tAc 'SELECT count(*) FROM users;' >/dev/null
  docker exec "$SCHOOL_B_DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -tAc 'SELECT count(*) FROM users;' >/dev/null
  printf 'PASS: distinct Docker school silos are queryable\n'
elif [[ "$CHECK_DOCKER_SILOS" != "0" ]]; then
  printf 'CHECK_DOCKER_SILOS must be 0 or 1\n' >&2
  exit 1
fi
