#!/usr/bin/env bash
#
# Refresh openapi/backend.json from the backend's committed OpenAPI document.
#
# The backend checks in its spec at backend/docs/openapi.json (regenerated with
# `make openapi` and guarded by a drift test), so this just copies it and
# injects the `servers` block the docs theme needs for the API demo panel.
#
# Environment overrides:
#   DNA_SPEC       path to an openapi.json                (default: ../backend/docs/openapi.json)
#   DNA_SERVER_URL base URL for the API demo panel        (default: http://localhost:8000)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$REPO_ROOT/openapi/backend.json"
SPEC="${DNA_SPEC:-$REPO_ROOT/../backend/docs/openapi.json}"
DNA_SERVER_URL="${DNA_SERVER_URL:-http://localhost:8000}"

[[ -f "$SPEC" ]] || {
  echo "error: $SPEC not found (regenerate it with 'make openapi' in backend/)" >&2
  exit 1
}

node - "$SPEC" "$OUT" "$DNA_SERVER_URL" <<'JS'
const fs = require("fs");
const [specPath, outPath, serverUrl] = process.argv.slice(2);
const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));

// FastAPI omits `servers`, which the docs theme needs to build the "Send API
// Request" base URL. Inject one rather than patching the generated MDX.
spec.servers ??= [{ url: serverUrl, description: "Local development" }];

fs.writeFileSync(outPath, JSON.stringify(spec, null, 2) + "\n");

const ops = Object.values(spec.paths)
  .flatMap((p) => Object.keys(p))
  .filter((m) => ["get", "post", "put", "patch", "delete"].includes(m)).length;
console.log(
  `    ${spec.info.title} v${spec.info.version} (${spec.openapi}): ` +
    `${Object.keys(spec.paths).length} paths, ${ops} operations, ` +
    `${Object.keys(spec.components?.schemas ?? {}).length} schemas`
);
JS

echo "==> Wrote $OUT"
echo "    Next: npm run regen-api-docs"
