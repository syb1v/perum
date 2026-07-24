#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ID="eebb39ca-480d-400b-b723-7258d6e880b6"
CORE_API_URL="${EXPO_PUBLIC_CORE_API_URL:-https://admin.perum.app/api}"
LINK_HOST="${EXPO_PUBLIC_LINK_HOST:-link.perum.app}"

cd "$SCRIPT_DIR"

usage() {
  cat <<'EOF'
Usage: ./mobile.sh <command> [platform]

Commands:
  go                    Start Expo Go with a tunnel and show a QR code
  preview [android|ios|all]
                        Build an internal installable app with EAS
  production <android|ios|all> --confirm
                        Start a production EAS build
  status                Show Expo account, project and build information
  preflight             Run config validation, typecheck and tests

Examples:
  ./mobile.sh go
  ./mobile.sh preview android
  ./mobile.sh preview all
  ./mobile.sh production android --confirm
EOF
}

find_eas() {
  if command -v eas >/dev/null 2>&1; then
    command -v eas
    return
  fi
  local global_eas="${HOME}/.npm-global/bin/eas"
  if [[ -x "$global_eas" ]]; then
    printf '%s\n' "$global_eas"
    return
  fi
  printf '%s\n' "npx eas-cli@21.2.0"
}

run_eas() {
  local eas_command
  eas_command="$(find_eas)"
  if [[ "$eas_command" == npx\ * ]]; then
    npx eas-cli@21.2.0 "$@"
  else
    "$eas_command" "$@"
  fi
}

set_runtime_env() {
  local environment="$1"
  export EXPO_PUBLIC_BUILD_ENV="$environment"
  export EXPO_PUBLIC_CORE_API_URL="$CORE_API_URL"
  export EXPO_PUBLIC_LINK_HOST="$LINK_HOST"
  export EXPO_PUBLIC_PROJECT_ID="$PROJECT_ID"
}

check_platform() {
  case "$1" in
    android|ios|all) ;;
    *)
      printf 'Unsupported platform: %s\n' "$1" >&2
      printf 'Use android, ios or all.\n' >&2
      exit 2
      ;;
  esac
}

check_eas_project() {
  run_eas whoami >/dev/null
  run_eas project:info >/dev/null
}

run_preflight() {
  npm run validate:config
  npm run typecheck
  npm test
}

command_name="${1:-help}"

case "$command_name" in
  go)
    set_runtime_env development
    npm run validate:config
    exec npx expo start --tunnel
    ;;
  preview)
    platform="${2:-android}"
    check_platform "$platform"
    set_runtime_env preview
    check_eas_project
    run_preflight
    run_eas build --profile preview --platform "$platform"
    ;;
  production)
    platform="${2:-}"
    confirmation="${3:-}"
    check_platform "$platform"
    if [[ "$confirmation" != "--confirm" ]]; then
      printf 'Production build requires explicit confirmation.\n' >&2
      printf 'Run: ./mobile.sh production %s --confirm\n' "$platform" >&2
      exit 2
    fi
    set_runtime_env production
    check_eas_project
    run_preflight
    run_eas build --profile production --platform "$platform"
    ;;
  status)
    set_runtime_env development
    run_eas whoami
    run_eas project:info
    run_eas build:list --limit 5
    ;;
  preflight)
    set_runtime_env preview
    run_preflight
    ;;
  help|-h|--help)
    usage
    ;;
  *)
    printf 'Unknown command: %s\n\n' "$command_name" >&2
    usage >&2
    exit 2
    ;;
esac
