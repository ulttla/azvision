#!/bin/bash
set -euo pipefail

BASE_URL="${AZVISION_API_BASE_URL:-http://127.0.0.1:8000/api/v1}"
WORKSPACE_ID="${AZVISION_SIMULATION_WORKSPACE_ID:-simulation-smoke-$(date +%Y%m%d%H%M%S)}"
OUT_DIR="${AZVISION_PROBE_OUT_DIR:-/tmp}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
TMP_DIR="$OUT_DIR/azvision_simulation_smoke_$TIMESTAMP"

mkdir -p "$TMP_DIR"

if ! command -v curl >/dev/null 2>&1; then
  echo "curl not found"
  exit 1
fi
if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 not found"
  exit 1
fi

echo "== AzVision simulation smoke =="
echo "BASE_URL=$BASE_URL"
echo "WORKSPACE_ID=$WORKSPACE_ID"

cat >"$TMP_DIR/create_payload.json" <<'JSON'
{
  "workload_name": "smoke-portal",
  "environment": "dev",
  "description": "private web app with SQL database, backup, monitoring, and DR"
}
JSON

create_code="$(curl -sS -o "$TMP_DIR/create_response.json" -w '%{http_code}' \
  -H 'Content-Type: application/json' \
  -d @"$TMP_DIR/create_payload.json" \
  "$BASE_URL/workspaces/$WORKSPACE_ID/simulations")"

SIMULATION_ID="$(python3 - "$TMP_DIR/create_response.json" "$create_code" <<'PY'
import json, sys
body_file, http_code = sys.argv[1:3]
with open(body_file, 'r', encoding='utf-8') as f:
    payload = json.load(f)
assert int(http_code) == 200, f"create simulation: expected HTTP 200, got {http_code}: {payload}"
assert payload.get('ok') is True, 'create simulation: expected ok=true'
simulation_id = payload.get('simulation_id') or ''
assert simulation_id.startswith('sim_'), 'create simulation: expected sim_* id'
assert payload.get('recommended_resources'), 'create simulation: expected recommendations'
assert payload.get('architecture_notes'), 'create simulation: expected architecture notes'
print(simulation_id)
PY
)"

echo "[create] simulation_id=$SIMULATION_ID"

cleanup_simulation() {
  if [[ -z "${SIMULATION_ID:-}" ]]; then
    return
  fi
  local delete_code
  delete_code="$(curl -sS -o "$TMP_DIR/delete_response.json" -w '%{http_code}' \
    -X DELETE \
    "$BASE_URL/workspaces/$WORKSPACE_ID/simulations/$SIMULATION_ID" || true)"
  python3 - "$TMP_DIR/delete_response.json" "$delete_code" "$SIMULATION_ID" <<'PY'
import json, sys
body_file, http_code, simulation_id = sys.argv[1:4]
if int(http_code) == 404:
    print(f"[cleanup] simulation already absent: {simulation_id}")
    raise SystemExit(0)
with open(body_file, 'r', encoding='utf-8') as f:
    payload = json.load(f)
assert int(http_code) == 200, f"cleanup delete: expected HTTP 200/404, got {http_code}: {payload}"
assert payload.get('ok') is True, 'cleanup delete: expected ok=true'
assert payload.get('deleted') is True, 'cleanup delete: expected deleted=true'
assert payload.get('simulation_id') == simulation_id, 'cleanup delete: id mismatch'
print(f"[cleanup] deleted {simulation_id}")
PY
}
trap cleanup_simulation EXIT

for endpoint in "" "/$SIMULATION_ID" "/$SIMULATION_ID/template" "/$SIMULATION_ID/report" "/$SIMULATION_ID/fit?limit=10"; do
  safe_name="$(printf '%s' "${endpoint:-list}" | tr '/?' '__' | tr -cd '[:alnum:]_.=-')"
  http_code="$(curl -sS -o "$TMP_DIR/${safe_name}.json" -w '%{http_code}' \
    "$BASE_URL/workspaces/$WORKSPACE_ID/simulations$endpoint")"
  python3 - "$TMP_DIR/${safe_name}.json" "$http_code" "$endpoint" "$SIMULATION_ID" <<'PY'
import json, sys
body_file, http_code, endpoint, simulation_id = sys.argv[1:5]
with open(body_file, 'r', encoding='utf-8') as f:
    payload = json.load(f)
assert int(http_code) == 200, f"{endpoint or 'list'}: expected HTTP 200, got {http_code}: {payload}"
if endpoint == '':
    assert payload.get('items'), 'list: expected items'
elif endpoint == f'/{simulation_id}':
    assert payload.get('simulation_id') == simulation_id, 'detail: id mismatch'
elif endpoint.endswith('/template'):
    assert payload.get('deployable') is False, 'template: expected non-deployable outline'
    assert payload.get('format') == 'bicep-outline', 'template: expected bicep-outline'
    assert payload.get('resources'), 'template: expected resources'
elif endpoint.endswith('/report'):
    content = payload.get('content') or ''
    assert payload.get('report_type') == 'markdown', 'report: expected markdown'
    assert 'Recommended resources' in content, 'report: expected recommended resources section'
    assert payload.get('warnings'), 'report: expected warnings'
elif '/fit' in endpoint:
    assert 'covered_count' in payload, 'fit: expected covered_count'
    assert 'missing_required_count' in payload, 'fit: expected missing_required_count'
print(f"[ok] {endpoint or 'list'}")
PY
done

cleanup_simulation
SIMULATION_ID=""
trap - EXIT

echo "PASS: AzVision simulation smoke completed"
