#!/bin/bash
set -euo pipefail

BASE_URL="${AZVISION_API_BASE_URL:-http://localhost:8000/api/v1}"
WORKSPACE_ID="${AZVISION_WORKSPACE_ID:-local-demo}"
OUT_DIR="${AZVISION_PROBE_OUT_DIR:-/tmp}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
TMP_DIR="$OUT_DIR/azvision_error_smoke_$TIMESTAMP"

mkdir -p "$TMP_DIR"

if ! command -v curl >/dev/null 2>&1; then
  echo "curl not found"
  exit 1
fi
if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 not found"
  exit 1
fi

run_case() {
  local name="$1"
  local method="$2"
  local url="$3"
  local expected_status="$4"
  local expected_message="$5"
  local body_file="$TMP_DIR/${name}.json"
  local http_code

  if [ "$method" = "GET" ]; then
    http_code="$(curl -sS -o "$body_file" -w '%{http_code}' "$url")"
  else
    http_code="$(curl -sS -o "$body_file" -w '%{http_code}' -X "$method" -H 'Content-Type: application/json' -d '{}' "$url")"
  fi

  python3 - "$name" "$body_file" "$http_code" "$expected_status" "$expected_message" <<'PY'
import json, sys
name, body_file, http_code, expected_status, expected_message = sys.argv[1:6]
with open(body_file, 'r', encoding='utf-8') as f:
    payload = json.load(f)
actual = {
    'http_code': int(http_code),
    'ok': payload.get('ok'),
    'status': payload.get('status'),
    'message': payload.get('message'),
}
print(f"[{name}] {actual}")
assert int(http_code) == int(expected_status), f"{name}: expected HTTP {expected_status}, got {http_code}"
assert payload.get('ok') is False, f"{name}: expected ok=false"
assert payload.get('status') == f"http-{expected_status}", (
    f"{name}: expected status http-{expected_status}, got {payload.get('status')}"
)
assert payload.get('message') == expected_message, (
    f"{name}: expected message {expected_message!r}, got {payload.get('message')!r}"
)
PY
}

echo "== AzVision error response smoke =="
echo "BASE_URL=$BASE_URL"
echo "WORKSPACE_ID=$WORKSPACE_ID"

a="${BASE_URL}/workspaces/${WORKSPACE_ID}/snapshots/does-not-exist"
b="${BASE_URL}/workspaces/${WORKSPACE_ID}/exports/does-not-exist"
c="${BASE_URL}/workspaces/${WORKSPACE_ID}/topology/manual-edges"

run_case "snapshot_not_found" "GET" "$a" "404" "Snapshot not found"
run_case "export_not_found" "GET" "$b" "404" "Export not found"
run_case "manual_edge_validation" "POST" "$c" "400" "source_node_key and target_node_key are required"

echo
echo "All error response smoke checks passed."
echo "Saved payloads: $TMP_DIR"
