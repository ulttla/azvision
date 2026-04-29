#!/bin/bash
set -euo pipefail

BASE_URL="${AZVISION_API_BASE_URL:-http://127.0.0.1:8000/api/v1}"
WORKSPACE_ID="${AZVISION_WORKSPACE_ID:-local-demo}"
OUT_DIR="${AZVISION_PROBE_OUT_DIR:-/tmp}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
TMP_DIR="$OUT_DIR/azvision_snapshot_compare_smoke_$TIMESTAMP"
BASE_SNAPSHOT_ID=""
TARGET_SNAPSHOT_ID=""

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
  for snapshot_id in "$BASE_SNAPSHOT_ID" "$TARGET_SNAPSHOT_ID"; do
    if [ -n "$snapshot_id" ]; then
      curl -sS -o "$TMP_DIR/cleanup_delete.json" -w '%{http_code}' -X DELETE \
        "$BASE_URL/workspaces/$WORKSPACE_ID/snapshots/$snapshot_id" >/dev/null || true
    fi
  done
}
trap cleanup EXIT

cat >"$TMP_DIR/base_snapshot.json" <<JSON
{
  "preset_version": 2,
  "name": "Snapshot compare base $TIMESTAMP",
  "note": "compare smoke base",
  "compare_refs": ["node-a", "node-b"],
  "cluster_children": true,
  "scope": "visible",
  "query": "prod",
  "selected_subscription_id": "sub-a",
  "resource_group_name": "rg-a",
  "topology_generated_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "visible_node_count": 5,
  "loaded_node_count": 6,
  "edge_count": 3,
  "thumbnail_data_url": ""
}
JSON

cat >"$TMP_DIR/target_snapshot.json" <<JSON
{
  "preset_version": 2,
  "name": "Snapshot compare target $TIMESTAMP",
  "note": "compare smoke target",
  "compare_refs": ["node-b", "node-c"],
  "cluster_children": true,
  "scope": "visible",
  "query": "prod",
  "selected_subscription_id": "sub-a",
  "resource_group_name": "rg-b",
  "topology_generated_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "visible_node_count": 8,
  "loaded_node_count": 10,
  "edge_count": 4,
  "thumbnail_data_url": ""
}
JSON

echo "== AzVision snapshot compare smoke =="
echo "BASE_URL=$BASE_URL"
echo "WORKSPACE_ID=$WORKSPACE_ID"

base_http_code="$(curl -sS -o "$TMP_DIR/base_response.json" -w '%{http_code}' \
  -X POST -H 'Content-Type: application/json' --data @"$TMP_DIR/base_snapshot.json" \
  "$BASE_URL/workspaces/$WORKSPACE_ID/snapshots")"

BASE_SNAPSHOT_ID="$(python3 - "$TMP_DIR/base_response.json" "$base_http_code" <<'PY'
import json, sys
body_file, http_code = sys.argv[1:3]
with open(body_file, 'r', encoding='utf-8') as f:
    payload = json.load(f)
assert int(http_code) == 200, f"base create: expected HTTP 200, got {http_code}"
assert payload.get('id'), 'base create: missing id'
print(payload['id'])
PY
)"

target_http_code="$(curl -sS -o "$TMP_DIR/target_response.json" -w '%{http_code}' \
  -X POST -H 'Content-Type: application/json' --data @"$TMP_DIR/target_snapshot.json" \
  "$BASE_URL/workspaces/$WORKSPACE_ID/snapshots")"

TARGET_SNAPSHOT_ID="$(python3 - "$TMP_DIR/target_response.json" "$target_http_code" <<'PY'
import json, sys
body_file, http_code = sys.argv[1:3]
with open(body_file, 'r', encoding='utf-8') as f:
    payload = json.load(f)
assert int(http_code) == 200, f"target create: expected HTTP 200, got {http_code}"
assert payload.get('id'), 'target create: missing id'
print(payload['id'])
PY
)"

cat >"$TMP_DIR/compare_request.json" <<JSON
{
  "base_snapshot_id": "$BASE_SNAPSHOT_ID",
  "target_snapshot_id": "$TARGET_SNAPSHOT_ID"
}
JSON

compare_http_code="$(curl -sS -o "$TMP_DIR/compare_response.json" -w '%{http_code}' \
  -X POST -H 'Content-Type: application/json' --data @"$TMP_DIR/compare_request.json" \
  "$BASE_URL/workspaces/$WORKSPACE_ID/snapshots/compare")"

python3 - "$TMP_DIR/compare_response.json" "$compare_http_code" "$BASE_SNAPSHOT_ID" "$TARGET_SNAPSHOT_ID" <<'PY'
import json, sys
body_file, http_code, base_id, target_id = sys.argv[1:5]
with open(body_file, 'r', encoding='utf-8') as f:
    payload = json.load(f)
assert int(http_code) == 200, f"compare: expected HTTP 200, got {http_code}"
assert payload.get('ok') is True, 'compare: expected ok=true'
assert payload.get('base_snapshot_id') == base_id, 'compare: base_snapshot_id mismatch'
assert payload.get('target_snapshot_id') == target_id, 'compare: target_snapshot_id mismatch'
count_delta = payload.get('count_delta') or {}
assert count_delta.get('visible_node_count') == 3, f"compare: visible_node_count delta mismatch: {count_delta}"
assert count_delta.get('loaded_node_count') == 4, f"compare: loaded_node_count delta mismatch: {count_delta}"
assert count_delta.get('edge_count') == 1, f"compare: edge_count delta mismatch: {count_delta}"
scope_delta = payload.get('scope_delta') or {}
assert scope_delta.get('resource_group_changed') is True, f"compare: expected resource_group_changed=true: {scope_delta}"
refs_delta = payload.get('compare_refs_delta') or {}
assert refs_delta.get('added') == ['node-c'], f"compare: added refs mismatch: {refs_delta}"
assert refs_delta.get('removed') == ['node-a'], f"compare: removed refs mismatch: {refs_delta}"
assert refs_delta.get('unchanged') == ['node-b'], f"compare: unchanged refs mismatch: {refs_delta}"
summary = payload.get('summary') or []
assert summary, 'compare: expected summary entries'
print(f"[compare] {base_id} -> {target_id} count_delta={count_delta} refs_delta={refs_delta}")
PY

echo "PASS: AzVision snapshot compare smoke completed"
