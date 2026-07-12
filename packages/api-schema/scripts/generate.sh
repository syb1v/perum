#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
TENANT_PYTHON="${TENANT_PYTHON:-python}"
CORE_PYTHON="${CORE_PYTHON:-python}"
[[ "$TENANT_PYTHON" = /* ]] || TENANT_PYTHON="$ROOT/$TENANT_PYTHON"
[[ "$CORE_PYTHON" = /* ]] || CORE_PYTHON="$ROOT/$CORE_PYTHON"

"$TENANT_PYTHON" "$ROOT/packages/api-schema/scripts/export_openapi.py" "$ROOT/perum-tenant" "$ROOT/packages/api-schema/openapi/tenant.json"
"$CORE_PYTHON" "$ROOT/packages/api-schema/scripts/export_openapi.py" "$ROOT/perum-core" "$ROOT/packages/api-schema/openapi/core.json"
"$ROOT/node_modules/.bin/openapi-typescript" "$ROOT/packages/api-schema/openapi/tenant.json" -o "$ROOT/packages/api-schema/generated/tenant.ts"
"$ROOT/node_modules/.bin/openapi-typescript" "$ROOT/packages/api-schema/openapi/core.json" -o "$ROOT/packages/api-schema/generated/core.ts"
