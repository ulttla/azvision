#!/bin/bash
set -euo pipefail

BASE_URL="${AZVISION_API_BASE_URL:-http://127.0.0.1:8000/api/v1}"
WORKSPACE_ID="${AZVISION_WORKSPACE_ID:-local-demo}"
OUT_DIR="${AZVISION_PROBE_OUT_DIR:-/tmp}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
TMP_DIR="$OUT_DIR/azvision_snapshot_payload_smoke_$TIMESTAMP"
THUMBNAIL_DATA_URL='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wn7L7sAAAAASUVORK5CYII='
SNAPSHOT_ID=""

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
  if [ -n "$SNAPSHOT_ID" ]; then
    curl -sS -o "$TMP_DIR/cleanup_delete.json" -w '%{http_code}' -X DELETE \
      "$BASE_URL/workspaces/$WORKSPACE_ID/snapshots/$SNAPSHOT_ID" >/dev/null || true
  fi
}
trap cleanup EXIT

cat >"$TMP_DIR/create_request.json" <<JSON
{
  "preset_version": 2,
  "name": "Snapshot payload smoke $TIMESTAMP",
  "note": "summary list should omit thumbnail_data_url",
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
  "thumbnail_data_url": "$THUMBNAIL_DATA_URL"
}
JSON

echo "== AzVision snapshot payload smoke =="
echo "BASE_URL=$BASE_URL"
echo "WORKSPACE_ID=$WORKSPACE_ID"

create_http_code="$(curl -sS -o "$TMP_DIR/create_response.json" -w '%{http_code}' \
  -X POST \
  -H 'Content-Type: application/json' \
  --data @"$TMP_DIR/create_request.json" \
  "$BASE_URL/workspaces/$WORKSPACE_ID/snapshots")"

SNAPSHOT_ID="$(python3 - "$TMP_DIR/create_response.json" "$create_http_code" "$THUMBNAIL_DATA_URL" <<'PY'
import json, sys
body_file, http_code, expected_thumbnail = sys.argv[1:4]
with open(body_file, 'r', encoding='utf-8') as f:
    payload = json.load(f)
assert int(http_code) == 200, f"create: expected HTTP 200, got {http_code}"
assert payload.get('id'), 'create: missing snapshot id'
assert payload.get('thumbnail_data_url') == expected_thumbnail, 'create: thumbnail_data_url mismatch'
print(payload['id'])
PY
)"

list_http_code="$(curl -sS -o "$TMP_DIR/list_response.json" -w '%{http_code}' \
  "$BASE_URL/workspaces/$WORKSPACE_ID/snapshots")"

python3 - "$TMP_DIR/list_response.json" "$list_http_code" "$SNAPSHOT_ID" <<'PY'
import json, sys
body_file, http_code, snapshot_id = sys.argv[1:4]
with open(body_file, 'r', encoding='utf-8') as f:
    payload = json.load(f)
assert int(http_code) == 200, f"list: expected HTTP 200, got {http_code}"
assert payload.get('ok') is True, 'list: expected ok=true'
items = payload.get('items') or []
item = next((entry for entry in items if entry.get('id') == snapshot_id), None)
assert item is not None, f"list: snapshot {snapshot_id} not found"
assert item.get('has_thumbnail') is True, 'list: expected has_thumbnail=true for snapshot with thumbnail'
assert 'thumbnail_data_url' not in item, 'list: thumbnail_data_url should be omitted from summary payload'
print(f"[list] found summary snapshot {snapshot_id} without thumbnail_data_url and with has_thumbnail=true")
PY

detail_http_code="$(curl -sS -o "$TMP_DIR/detail_response.json" -w '%{http_code}' \
  "$BASE_URL/workspaces/$WORKSPACE_ID/snapshots/$SNAPSHOT_ID")"

python3 - "$TMP_DIR/detail_response.json" "$detail_http_code" "$SNAPSHOT_ID" "$THUMBNAIL_DATA_URL" "$TMP_DIR/list_response.json" <<'PY'
import json, sys
detail_file, http_code, snapshot_id, expected_thumbnail, list_file = sys.argv[1:6]
with open(detail_file, 'r', encoding='utf-8') as f:
    detail = json.load(f)
with open(list_file, 'r', encoding='utf-8') as f:
    list_payload = json.load(f)
assert int(http_code) == 200, f"detail: expected HTTP 200, got {http_code}"
assert detail.get('id') == snapshot_id, f"detail: expected id {snapshot_id}, got {detail.get('id')}"
assert detail.get('thumbnail_data_url') == expected_thumbnail, 'detail: thumbnail_data_url mismatch'
list_item = next((entry for entry in (list_payload.get('items') or []) if entry.get('id') == snapshot_id), None)
assert list_item is not None, f"detail: snapshot {snapshot_id} missing from list payload"
summary_item_bytes = len(json.dumps(list_item, separators=(',', ':')).encode('utf-8'))
detail_item_bytes = len(json.dumps(detail, separators=(',', ':')).encode('utf-8'))
print(f"[detail] thumbnail_data_url restored on single-record GET for {snapshot_id}")
print(f"[size] summary_item_bytes={summary_item_bytes} detail_item_bytes={detail_item_bytes} delta={detail_item_bytes - summary_item_bytes}")
PY

delete_http_code="$(curl -sS -o "$TMP_DIR/delete_response.json" -w '%{http_code}' -X DELETE \
  "$BASE_URL/workspaces/$WORKSPACE_ID/snapshots/$SNAPSHOT_ID")"

python3 - "$TMP_DIR/delete_response.json" "$delete_http_code" "$SNAPSHOT_ID" <<'PY'
import json, sys
body_file, http_code, snapshot_id = sys.argv[1:4]
with open(body_file, 'r', encoding='utf-8') as f:
    payload = json.load(f)
assert int(http_code) == 200, f"delete: expected HTTP 200, got {http_code}"
assert payload.get('status') == 'deleted', f"delete: expected status=deleted, got {payload.get('status')}"
assert payload.get('snapshot_id') == snapshot_id, f"delete: expected snapshot_id={snapshot_id}, got {payload.get('snapshot_id')}"
print(f"[delete] removed {snapshot_id}")
PY

SNAPSHOT_ID=""

echo
echo "Snapshot payload smoke checks passed."
echo "Saved payloads: $TMP_DIR"
