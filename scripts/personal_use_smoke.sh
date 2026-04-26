#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${AZVISION_API_BASE_URL:-http://127.0.0.1:8000/api/v1}"
WORKSPACE_ID="${AZVISION_WORKSPACE_ID:-local-demo}"
SMOKE_WORKSPACE_ID="${AZVISION_SMOKE_WORKSPACE_ID:-personal-smoke-$(date +%Y%m%d%H%M%S)}"
RESOURCE_GROUP_LIMIT="${AZVISION_RESOURCE_GROUP_LIMIT:-50}"
RESOURCE_LIMIT="${AZVISION_RESOURCE_LIMIT:-80}"
SKIP_LIVE="${AZVISION_SKIP_LIVE:-0}"
CURL_MAX_TIME="${AZVISION_CURL_MAX_TIME:-30}"
TMP_DIR="${AZVISION_SMOKE_OUT_DIR:-/tmp/azvision-personal-smoke}"
mkdir -p "$TMP_DIR"

if ! command -v curl >/dev/null 2>&1; then
  echo "curl not found"
  exit 1
fi
if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 not found"
  exit 1
fi

json_value() {
  python3 - "$1" "$2" <<'PY'
import json, sys
path, key = sys.argv[1:3]
with open(path, encoding='utf-8') as f:
    data = json.load(f)
value = data
for part in key.split('.'):
    if part == '':
        continue
    if isinstance(value, list):
        value = value[int(part)]
    else:
        value = value.get(part)
print('' if value is None else value)
PY
}

curl_json() {
  local method="$1"
  local url="$2"
  local outfile="$3"
  local data="${4:-}"
  local code
  if [ -n "$data" ]; then
    code="$(curl --max-time "$CURL_MAX_TIME" -sS -o "$outfile" -w '%{http_code}' -X "$method" -H 'Content-Type: application/json' --data "$data" "$url")"
  else
    code="$(curl --max-time "$CURL_MAX_TIME" -sS -o "$outfile" -w '%{http_code}' -X "$method" "$url")"
  fi
  if [ "$code" -lt 200 ] || [ "$code" -ge 300 ]; then
    echo "Request failed: $method $url -> HTTP $code"
    cat "$outfile" || true
    exit 1
  fi
}

assert_json_bool() {
  local file="$1"
  local key="$2"
  local expected="$3"
  local actual
  actual="$(json_value "$file" "$key")"
  if [ "$actual" != "$expected" ]; then
    echo "Assertion failed: $key expected $expected, got $actual"
    cat "$file" || true
    exit 1
  fi
}

assert_empty_items() {
  local file="$1"
  python3 - "$file" <<'PY'
import json, sys
with open(sys.argv[1], encoding='utf-8') as f:
    payload = json.load(f)
items = payload.get('items')
if items != []:
    raise SystemExit(f"expected empty items, got {len(items) if isinstance(items, list) else items!r}")
PY
}

cleanup() {
  set +e
  if [ -n "${EDGE_REF:-}" ]; then
    curl -fsS -X DELETE "$BASE_URL/workspaces/$SMOKE_WORKSPACE_ID/topology/manual-edges/$EDGE_REF" >/dev/null 2>&1 || true
  fi
  if [ -n "${SRC_REF:-}" ]; then
    curl -fsS -X DELETE "$BASE_URL/workspaces/$SMOKE_WORKSPACE_ID/topology/manual-nodes/$SRC_REF" >/dev/null 2>&1 || true
  fi
  if [ -n "${TGT_REF:-}" ]; then
    curl -fsS -X DELETE "$BASE_URL/workspaces/$SMOKE_WORKSPACE_ID/topology/manual-nodes/$TGT_REF" >/dev/null 2>&1 || true
  fi
  if [ -n "${SNAPSHOT_ID:-}" ]; then
    curl -fsS -X DELETE "$BASE_URL/workspaces/$SMOKE_WORKSPACE_ID/snapshots/$SNAPSHOT_ID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

echo "== AzVision personal-use smoke =="
echo "BASE_URL=$BASE_URL"
echo "WORKSPACE_ID=$WORKSPACE_ID"
echo "SMOKE_WORKSPACE_ID=$SMOKE_WORKSPACE_ID"

ROOT_JSON="$TMP_DIR/root.json"
HEALTH_JSON="$TMP_DIR/health.json"
curl_json GET "${BASE_URL%/api/v1}/" "$ROOT_JSON"
curl_json GET "${BASE_URL%/api/v1}/healthz" "$HEALTH_JSON"
assert_json_bool "$HEALTH_JSON" status ok

echo "[ok] backend root + healthz"

if [ "$SKIP_LIVE" != "1" ]; then
  CONFIG_JSON="$TMP_DIR/config-check.json"
  READ_JSON="$TMP_DIR/read-test.json"
  TOPOLOGY_JSON="$TMP_DIR/topology.json"
  curl_json GET "$BASE_URL/auth/config-check" "$CONFIG_JSON"
  assert_json_bool "$CONFIG_JSON" auth_ready True
  curl_json GET "$BASE_URL/auth/read-test" "$READ_JSON"
  assert_json_bool "$READ_JSON" ok True
  curl_json GET "$BASE_URL/workspaces/$WORKSPACE_ID/topology?include_network_inference=true&resource_group_limit=$RESOURCE_GROUP_LIMIT&resource_limit=$RESOURCE_LIMIT" "$TOPOLOGY_JSON"
  python3 - "$TOPOLOGY_JSON" <<'PY'
import json, sys
with open(sys.argv[1], encoding='utf-8') as f:
    data = json.load(f)
summary = data.get('summary') or {}
if int(summary.get('node_count') or 0) < 1:
    raise SystemExit('topology node_count is empty')
print('[ok] live topology', {'node_count': summary.get('node_count'), 'edge_count': summary.get('edge_count')})
PY
else
  echo "[skip] live Azure read/topology smoke skipped because AZVISION_SKIP_LIVE=1"
fi

SRC_JSON="$TMP_DIR/manual-src.json"
TGT_JSON="$TMP_DIR/manual-tgt.json"
EDGE_JSON="$TMP_DIR/manual-edge.json"
EDGE_UPDATE_JSON="$TMP_DIR/manual-edge-update.json"
SNAP_CREATE_JSON="$TMP_DIR/snapshot-create.json"
SNAP_LIST_JSON="$TMP_DIR/snapshot-list.json"
SNAP_DETAIL_JSON="$TMP_DIR/snapshot-detail.json"
SNAP_RESTORE_JSON="$TMP_DIR/snapshot-restore.json"

curl_json POST "$BASE_URL/workspaces/$SMOKE_WORKSPACE_ID/topology/manual-nodes" "$SRC_JSON" '{"display_name":"Smoke Source","manual_type":"external-system"}'
curl_json POST "$BASE_URL/workspaces/$SMOKE_WORKSPACE_ID/topology/manual-nodes" "$TGT_JSON" '{"display_name":"Smoke Target","manual_type":"on-prem-server"}'
SRC_REF="$(json_value "$SRC_JSON" manual_ref)"
TGT_REF="$(json_value "$TGT_JSON" manual_ref)"
SRC_KEY="$(json_value "$SRC_JSON" node_key)"
TGT_KEY="$(json_value "$TGT_JSON" node_key)"
EDGE_PAYLOAD="{\"source_node_key\":\"$SRC_KEY\",\"target_node_key\":\"$TGT_KEY\",\"relation_type\":\"connects_to\"}"
curl_json POST "$BASE_URL/workspaces/$SMOKE_WORKSPACE_ID/topology/manual-edges" "$EDGE_JSON" "$EDGE_PAYLOAD"
EDGE_REF="$(json_value "$EDGE_JSON" manual_edge_ref)"
curl_json PATCH "$BASE_URL/workspaces/$SMOKE_WORKSPACE_ID/topology/manual-edges/$EDGE_REF" "$EDGE_UPDATE_JSON" '{"relation_type":"routes"}'
assert_json_bool "$EDGE_UPDATE_JSON" relation_type routes

echo "[ok] manual node/edge create-update path"

SNAP_PAYLOAD='{"preset_version":1,"name":"Personal Smoke Snapshot","note":"created by scripts/personal_use_smoke.sh","compare_refs":[],"cluster_children":true,"scope":"visible","query":"","selected_subscription_id":"","resource_group_name":"","topology_generated_at":"2026-04-26T00:00:00Z","visible_node_count":2,"loaded_node_count":2,"edge_count":1,"thumbnail_data_url":""}'
curl_json POST "$BASE_URL/workspaces/$SMOKE_WORKSPACE_ID/snapshots" "$SNAP_CREATE_JSON" "$SNAP_PAYLOAD"
SNAPSHOT_ID="$(json_value "$SNAP_CREATE_JSON" id)"
curl_json GET "$BASE_URL/workspaces/$SMOKE_WORKSPACE_ID/snapshots?sort_by=updated_at&sort_order=desc&include_archived=false&pinned_first=true" "$SNAP_LIST_JSON"
curl_json GET "$BASE_URL/workspaces/$SMOKE_WORKSPACE_ID/snapshots/$SNAPSHOT_ID" "$SNAP_DETAIL_JSON"
curl_json POST "$BASE_URL/workspaces/$SMOKE_WORKSPACE_ID/snapshots/$SNAPSHOT_ID/restore-events" "$SNAP_RESTORE_JSON" '{}'
assert_json_bool "$SNAP_RESTORE_JSON" id "$SNAPSHOT_ID"

echo "[ok] snapshot create-list-detail-restore path"

cleanup
unset EDGE_REF SRC_REF TGT_REF SNAPSHOT_ID

POST_NODES_JSON="$TMP_DIR/manual-nodes-after-cleanup.json"
POST_EDGES_JSON="$TMP_DIR/manual-edges-after-cleanup.json"
POST_SNAPSHOTS_JSON="$TMP_DIR/snapshots-after-cleanup.json"
curl_json GET "$BASE_URL/workspaces/$SMOKE_WORKSPACE_ID/topology/manual-nodes" "$POST_NODES_JSON"
curl_json GET "$BASE_URL/workspaces/$SMOKE_WORKSPACE_ID/topology/manual-edges" "$POST_EDGES_JSON"
curl_json GET "$BASE_URL/workspaces/$SMOKE_WORKSPACE_ID/snapshots?include_archived=true" "$POST_SNAPSHOTS_JSON"
assert_empty_items "$POST_NODES_JSON"
assert_empty_items "$POST_EDGES_JSON"
assert_empty_items "$POST_SNAPSHOTS_JSON"

echo "[ok] smoke workspace cleanup verified"
echo "PASS: AzVision personal-use smoke completed"
