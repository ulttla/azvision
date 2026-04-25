#!/bin/bash
set -euo pipefail

BASE_URL="${AZVISION_API_BASE_URL:-http://127.0.0.1:8000/api/v1}"
WORKSPACE_ID="${AZVISION_WORKSPACE_ID:-local-demo}"
OUT_DIR="${AZVISION_PROBE_OUT_DIR:-/tmp}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
TMP_DIR="$OUT_DIR/azvision_snapshot_sort_api_smoke_$TIMESTAMP"
SNAPSHOT_IDS=()

mkdir -p "$TMP_DIR"

if ! command -v curl >/dev/null 2>&1; then
  echo "curl not found"
  exit 1
fi
if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 not found"
  exit 1
fi

cleanup() {
  if [ "${#SNAPSHOT_IDS[@]}" -eq 0 ]; then
    return
  fi

  for snapshot_id in "${SNAPSHOT_IDS[@]}"; do
    if [ -n "$snapshot_id" ]; then
      curl -sS -X DELETE "$BASE_URL/workspaces/$WORKSPACE_ID/snapshots/$snapshot_id" >/dev/null || true
    fi
  done
}
trap cleanup EXIT

create_snapshot() {
  local key="$1"
  local captured_at="$2"
  local name="Sort smoke ${TIMESTAMP} ${key}"
  local payload_path="$TMP_DIR/create_${key}.json"
  local response_path="$TMP_DIR/create_${key}_response.json"

  cat >"$payload_path" <<JSON
{
  "preset_version": 2,
  "name": "$name",
  "note": "snapshot sort api smoke",
  "compare_refs": [],
  "cluster_children": true,
  "scope": "visible",
  "query": "",
  "selected_subscription_id": "",
  "resource_group_name": "",
  "topology_generated_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "visible_node_count": 1,
  "loaded_node_count": 1,
  "edge_count": 0,
  "thumbnail_data_url": "",
  "captured_at": "$captured_at"
}
JSON

  local http_code
  if ! http_code="$(curl -sS -o "$response_path" -w '%{http_code}' \
    -X POST \
    -H 'Content-Type: application/json' \
    --data @"$payload_path" \
    "$BASE_URL/workspaces/$WORKSPACE_ID/snapshots")"; then
    echo "create: request failed for $key" >&2
    return 1
  fi

  local snapshot_id
  if ! snapshot_id="$(python3 - "$response_path" "$http_code" "$name" <<'PY'
import json, sys
body_file, http_code, expected_name = sys.argv[1:4]
with open(body_file, 'r', encoding='utf-8') as f:
    payload = json.load(f)
assert int(http_code) == 200, f"create: expected HTTP 200, got {http_code}"
assert payload.get('name') == expected_name, f"create: expected name {expected_name}, got {payload.get('name')}"
assert payload.get('id'), 'create: missing snapshot id'
print(payload['id'])
PY
)"; then
    echo "create: response validation failed for $key" >&2
    return 1
  fi

  echo "$snapshot_id"
}

patch_snapshot() {
  local snapshot_id="$1"
  local patch_json="$2"
  local out_name="$3"
  local response_path="$TMP_DIR/${out_name}.json"
  local http_code

  http_code="$(curl -sS -o "$response_path" -w '%{http_code}' \
    -X PATCH \
    -H 'Content-Type: application/json' \
    --data "$patch_json" \
    "$BASE_URL/workspaces/$WORKSPACE_ID/snapshots/$snapshot_id")"

  python3 - "$response_path" "$http_code" <<'PY'
import json, sys
body_file, http_code = sys.argv[1:3]
with open(body_file, 'r', encoding='utf-8') as f:
    payload = json.load(f)
assert int(http_code) == 200, f"patch: expected HTTP 200, got {http_code}"
assert payload.get('id'), 'patch: missing snapshot id'
PY
}

post_restore_event() {
  local snapshot_id="$1"
  local response_path="$TMP_DIR/restore_${snapshot_id}.json"
  local http_code

  http_code="$(curl -sS -o "$response_path" -w '%{http_code}' \
    -X POST \
    "$BASE_URL/workspaces/$WORKSPACE_ID/snapshots/$snapshot_id/restore-events")"

  python3 - "$response_path" "$http_code" <<'PY'
import json, sys
body_file, http_code = sys.argv[1:3]
with open(body_file, 'r', encoding='utf-8') as f:
    payload = json.load(f)
assert int(http_code) == 200, f"restore-event: expected HTTP 200, got {http_code}"
assert payload.get('restore_count') == 1, f"restore-event: expected restore_count=1, got {payload.get('restore_count')}"
assert payload.get('last_restored_at'), 'restore-event: missing last_restored_at'
PY
}

echo "== AzVision snapshot sort API smoke =="
echo "BASE_URL=$BASE_URL"
echo "WORKSPACE_ID=$WORKSPACE_ID"

a_id="$(create_snapshot older '2026-04-21T10:00:00Z')"
SNAPSHOT_IDS+=("$a_id")
b_id="$(create_snapshot restored '2026-04-21T10:05:00Z')"
SNAPSHOT_IDS+=("$b_id")
c_id="$(create_snapshot pinned '2026-04-21T10:10:00Z')"
SNAPSHOT_IDS+=("$c_id")
d_id="$(create_snapshot archived '2026-04-21T10:15:00Z')"
SNAPSHOT_IDS+=("$d_id")

post_restore_event "$b_id"
patch_snapshot "$c_id" '{"is_pinned": true}' "patch_pinned"
patch_snapshot "$d_id" '{"archived": true}' "patch_archived"

captured_http_code="$(curl -sS -o "$TMP_DIR/list_captured_asc.json" -w '%{http_code}' \
  "$BASE_URL/workspaces/$WORKSPACE_ID/snapshots?sort_by=captured_at&sort_order=asc&pinned_first=false&include_archived=true")"

python3 - "$TMP_DIR/list_captured_asc.json" "$captured_http_code" "$TIMESTAMP" <<'PY'
import json, sys
body_file, http_code, stamp = sys.argv[1:4]
with open(body_file, 'r', encoding='utf-8') as f:
    payload = json.load(f)
assert int(http_code) == 200, f"captured asc: expected HTTP 200, got {http_code}"
names = [item['name'] for item in payload.get('items', []) if f'Sort smoke {stamp}' in item.get('name', '')]
expected = [
    f'Sort smoke {stamp} older',
    f'Sort smoke {stamp} restored',
    f'Sort smoke {stamp} pinned',
    f'Sort smoke {stamp} archived',
]
assert names[:4] == expected, f"captured asc order mismatch: {names[:4]} != {expected}"
print(f"[captured_at asc] {names[:4]}")
PY

recent_http_code="$(curl -sS -o "$TMP_DIR/list_recent_desc.json" -w '%{http_code}' \
  "$BASE_URL/workspaces/$WORKSPACE_ID/snapshots?sort_by=last_restored_at&sort_order=desc&pinned_first=false&include_archived=true")"

python3 - "$TMP_DIR/list_recent_desc.json" "$recent_http_code" "$TIMESTAMP" <<'PY'
import json, sys
body_file, http_code, stamp = sys.argv[1:4]
with open(body_file, 'r', encoding='utf-8') as f:
    payload = json.load(f)
assert int(http_code) == 200, f"last_restored desc: expected HTTP 200, got {http_code}"
names = [item['name'] for item in payload.get('items', []) if f'Sort smoke {stamp}' in item.get('name', '')]
expected = [
    f'Sort smoke {stamp} restored',
    f'Sort smoke {stamp} pinned',
    f'Sort smoke {stamp} older',
    f'Sort smoke {stamp} archived',
]
assert names[:4] == expected, f"last_restored desc order mismatch: {names[:4]} != {expected}"
print(f"[last_restored_at desc] {names[:4]}")
PY

updated_http_code="$(curl -sS -o "$TMP_DIR/list_updated_asc.json" -w '%{http_code}' \
  "$BASE_URL/workspaces/$WORKSPACE_ID/snapshots?sort_by=updated_at&sort_order=asc&pinned_first=false&include_archived=true")"

python3 - "$TMP_DIR/list_updated_asc.json" "$updated_http_code" "$TIMESTAMP" <<'PY'
import json, sys
body_file, http_code, stamp = sys.argv[1:4]
with open(body_file, 'r', encoding='utf-8') as f:
    payload = json.load(f)
assert int(http_code) == 200, f"updated_at asc: expected HTTP 200, got {http_code}"
names = [item['name'] for item in payload.get('items', []) if f'Sort smoke {stamp}' in item.get('name', '')]
expected = [
    f'Sort smoke {stamp} older',
    f'Sort smoke {stamp} restored',
    f'Sort smoke {stamp} pinned',
    f'Sort smoke {stamp} archived',
]
assert names[:4] == expected, f"updated_at asc order mismatch: {names[:4]} != {expected}"
print(f"[updated_at asc] {names[:4]}")
PY

pinned_http_code="$(curl -sS -o "$TMP_DIR/list_pinned_first.json" -w '%{http_code}' \
  "$BASE_URL/workspaces/$WORKSPACE_ID/snapshots?sort_by=last_restored_at&sort_order=desc&pinned_first=true&include_archived=true")"

python3 - "$TMP_DIR/list_pinned_first.json" "$pinned_http_code" "$TIMESTAMP" <<'PY'
import json, sys
body_file, http_code, stamp = sys.argv[1:4]
with open(body_file, 'r', encoding='utf-8') as f:
    payload = json.load(f)
assert int(http_code) == 200, f"pinned first: expected HTTP 200, got {http_code}"
names = [item['name'] for item in payload.get('items', []) if f'Sort smoke {stamp}' in item.get('name', '')]
assert names and names[0] == f'Sort smoke {stamp} pinned', f"pinned first mismatch: {names}"
print(f"[pinned_first] first={names[0]}")
PY

active_only_http_code="$(curl -sS -o "$TMP_DIR/list_active_only.json" -w '%{http_code}' \
  "$BASE_URL/workspaces/$WORKSPACE_ID/snapshots?include_archived=false&pinned_first=false&sort_by=captured_at&sort_order=asc")"

python3 - "$TMP_DIR/list_active_only.json" "$active_only_http_code" "$TIMESTAMP" <<'PY'
import json, sys
body_file, http_code, stamp = sys.argv[1:4]
with open(body_file, 'r', encoding='utf-8') as f:
    payload = json.load(f)
assert int(http_code) == 200, f"active only: expected HTTP 200, got {http_code}"
names = [item['name'] for item in payload.get('items', []) if f'Sort smoke {stamp}' in item.get('name', '')]
assert f'Sort smoke {stamp} archived' not in names, f"include_archived=false still returned archived item: {names}"
expected = [
    f'Sort smoke {stamp} older',
    f'Sort smoke {stamp} restored',
    f'Sort smoke {stamp} pinned',
]
assert names[:3] == expected, f"active only order mismatch: {names[:3]} != {expected}"
print(f"[include_archived=false] {names[:3]}")
PY

active_pinned_http_code="$(curl -sS -o "$TMP_DIR/list_active_pinned_first.json" -w '%{http_code}' \
  "$BASE_URL/workspaces/$WORKSPACE_ID/snapshots?include_archived=false&pinned_first=true&sort_by=captured_at&sort_order=asc")"

python3 - "$TMP_DIR/list_active_pinned_first.json" "$active_pinned_http_code" "$TIMESTAMP" <<'PY'
import json, sys
body_file, http_code, stamp = sys.argv[1:4]
with open(body_file, 'r', encoding='utf-8') as f:
    payload = json.load(f)
assert int(http_code) == 200, f"active pinned first: expected HTTP 200, got {http_code}"
names = [item['name'] for item in payload.get('items', []) if f'Sort smoke {stamp}' in item.get('name', '')]
assert f'Sort smoke {stamp} archived' not in names, f"include_archived=false still returned archived item: {names}"
expected = [
    f'Sort smoke {stamp} pinned',
    f'Sort smoke {stamp} older',
    f'Sort smoke {stamp} restored',
]
assert names[:3] == expected, f"active pinned-first order mismatch: {names[:3]} != {expected}"
print(f"[include_archived=false + pinned_first] {names[:3]}")
PY

echo
echo "Snapshot sort API smoke checks passed."
echo "Saved payloads: $TMP_DIR"
