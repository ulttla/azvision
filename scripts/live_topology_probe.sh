#!/bin/bash
set -euo pipefail

BASE_URL="${AZVISION_API_BASE_URL:-http://localhost:8000/api/v1}"
WORKSPACE_ID="${AZVISION_WORKSPACE_ID:-local-demo}"
SUBSCRIPTION_ID="${AZVISION_SUBSCRIPTION_ID:-}"
RESOURCE_GROUP_NAME="${AZVISION_RESOURCE_GROUP_NAME:-}"
RESOURCE_GROUP_LIMIT="${AZVISION_RESOURCE_GROUP_LIMIT:-200}"
RESOURCE_LIMIT="${AZVISION_RESOURCE_LIMIT:-200}"
OUT_DIR="${AZVISION_PROBE_OUT_DIR:-/tmp}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
CONFIG_JSON="$OUT_DIR/azvision_config_check_${TIMESTAMP}.json"
READ_TEST_JSON="$OUT_DIR/azvision_read_test_${TIMESTAMP}.json"
TOPOLOGY_JSON="$OUT_DIR/azvision_topology_probe_${TIMESTAMP}.json"

mkdir -p "$OUT_DIR"

if ! command -v curl >/dev/null 2>&1; then
  echo "curl not found"
  exit 1
fi
if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 not found"
  exit 1
fi

curl_json() {
  local url="$1"
  local outfile="$2"
  if ! curl -fsS "$url" -o "$outfile"; then
    echo "Request failed: $url"
    echo "Backend reachable check failed. Start backend first, e.g. cd /Users/gun/dev/azvision/backend && ./.venv/bin/uvicorn app.main:app --reload --port 8000"
    exit 1
  fi
}

append_query() {
  local url="$1"
  local key="$2"
  local value="$3"
  if [ -z "$value" ]; then
    printf '%s' "$url"
    return
  fi
  python3 - "$url" "$key" "$value" <<'PY'
import sys
from urllib.parse import urlencode
url, key, value = sys.argv[1:4]
sep = '&' if '?' in url else '?'
print(url + sep + urlencode({key: value}))
PY
}

CONFIG_URL="$BASE_URL/auth/config-check"
READ_TEST_URL="$BASE_URL/auth/read-test"
TOPOLOGY_URL="$BASE_URL/workspaces/$WORKSPACE_ID/topology?include_network_inference=true&resource_group_limit=$RESOURCE_GROUP_LIMIT&resource_limit=$RESOURCE_LIMIT"
TOPOLOGY_URL="$(append_query "$TOPOLOGY_URL" "subscription_id" "$SUBSCRIPTION_ID")"
TOPOLOGY_URL="$(append_query "$TOPOLOGY_URL" "resource_group_name" "$RESOURCE_GROUP_NAME")"

echo "== AzVision live topology probe =="
echo "BASE_URL=$BASE_URL"
echo "WORKSPACE_ID=$WORKSPACE_ID"
if [ -n "$SUBSCRIPTION_ID" ]; then
  echo "SUBSCRIPTION_ID=$SUBSCRIPTION_ID"
fi
if [ -n "$RESOURCE_GROUP_NAME" ]; then
  echo "RESOURCE_GROUP_NAME=$RESOURCE_GROUP_NAME"
fi

echo
echo "[1/3] auth config-check"
curl_json "$CONFIG_URL" "$CONFIG_JSON"
python3 - "$CONFIG_JSON" <<'PY'
import json, sys
with open(sys.argv[1], 'r', encoding='utf-8') as f:
    payload = json.load(f)
checks = payload.get('checks', {})
print({
    'auth_ready': payload.get('auth_ready'),
    'tenant_id_present': checks.get('tenant_id_present'),
    'client_id_present': checks.get('client_id_present'),
    'certificate_path_present': checks.get('certificate_path_present'),
    'certificate_path_exists': checks.get('certificate_path_exists'),
    'discovered_env_files': checks.get('discovered_env_files'),
})
PY

echo
echo "[2/3] auth read-test"
curl_json "$READ_TEST_URL" "$READ_TEST_JSON"
READ_TEST_OK="$(python3 - "$READ_TEST_JSON" <<'PY'
import json, sys
with open(sys.argv[1], 'r', encoding='utf-8') as f:
    payload = json.load(f)
print('true' if payload.get('ok') else 'false')
print({
    'ok': payload.get('ok'),
    'status': payload.get('status'),
    'token_acquired': payload.get('token_acquired'),
    'subscription_count': len(payload.get('accessible_subscriptions') or []),
    'sample_resource_group_count': len(payload.get('sample_resource_groups') or []),
    'message': payload.get('message'),
})
PY
)"
echo "$READ_TEST_OK" | tail -n +2
READ_TEST_STATUS="$(echo "$READ_TEST_OK" | head -n 1)"

if [ "$READ_TEST_STATUS" != "true" ]; then
  echo
  echo "Live read-test not ready. Skipping topology probe."
  echo "Saved payloads:"
  echo "  $CONFIG_JSON"
  echo "  $READ_TEST_JSON"
  exit 0
fi

echo
echo "[3/3] topology probe (include_network_inference=true)"
curl_json "$TOPOLOGY_URL" "$TOPOLOGY_JSON"
python3 - "$TOPOLOGY_JSON" <<'PY'
import json, sys
with open(sys.argv[1], 'r', encoding='utf-8') as f:
    payload = json.load(f)
edges = payload.get('edges') or []
inferred = [edge for edge in edges if edge.get('resolver')]
relation_counts = {}
for edge in inferred:
    relation = edge.get('relation_type', 'unknown')
    relation_counts[relation] = relation_counts.get(relation, 0) + 1
summary = payload.get('summary') or {}
print({
    'mode': payload.get('mode'),
    'status': payload.get('status', 'ok'),
    'node_count': summary.get('node_count'),
    'edge_count': summary.get('edge_count'),
    'resource_count': summary.get('resource_count'),
    'inferred_edge_count': len(inferred),
    'inferred_relation_counts': relation_counts,
})
print('sample_inferred_edges=')
for edge in inferred[:10]:
    print({
        'source_node_key': edge.get('source_node_key'),
        'target_node_key': edge.get('target_node_key'),
        'relation_type': edge.get('relation_type'),
        'confidence': edge.get('confidence'),
        'resolver': edge.get('resolver'),
        'evidence': edge.get('evidence'),
    })
PY

echo
echo "Saved payloads:"
echo "  $CONFIG_JSON"
echo "  $READ_TEST_JSON"
echo "  $TOPOLOGY_JSON"
