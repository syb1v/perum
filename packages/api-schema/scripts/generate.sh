#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
if [[ -z "${TENANT_PYTHON:-}" && -x "$ROOT/perum-tenant/.venv/bin/python" ]]; then
  TENANT_PYTHON="perum-tenant/.venv/bin/python"
else
  TENANT_PYTHON="${TENANT_PYTHON:-python}"
fi
if [[ -z "${CORE_PYTHON:-}" && -x "$ROOT/perum-core/.venv/bin/python" ]]; then
  CORE_PYTHON="perum-core/.venv/bin/python"
else
  CORE_PYTHON="${CORE_PYTHON:-python}"
fi

resolve_python() {
  local value="$1"
  if [[ "$value" = /* ]]; then
    printf '%s\n' "$value"
  elif [[ "$value" == */* ]]; then
    printf '%s\n' "$ROOT/$value"
  else
    command -v "$value"
  fi
}

TENANT_PYTHON="$(resolve_python "$TENANT_PYTHON")"
CORE_PYTHON="$(resolve_python "$CORE_PYTHON")"

"$TENANT_PYTHON" "$ROOT/packages/api-schema/scripts/export_openapi.py" "$ROOT/perum-tenant" "$ROOT/packages/api-schema/openapi/tenant.json"
"$CORE_PYTHON" "$ROOT/packages/api-schema/scripts/export_openapi.py" "$ROOT/perum-core" "$ROOT/packages/api-schema/openapi/core.json"
"$ROOT/node_modules/.bin/openapi-typescript" "$ROOT/packages/api-schema/openapi/tenant.json" -o "$ROOT/packages/api-schema/generated/tenant.ts"
"$ROOT/node_modules/.bin/openapi-typescript" "$ROOT/packages/api-schema/openapi/core.json" -o "$ROOT/packages/api-schema/generated/core.ts"
