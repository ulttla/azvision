#!/bin/bash
set -euo pipefail

BASE_URL="${AZVISION_API_BASE_URL:-http://127.0.0.1:8000/api/v1}"
WORKSPACE_ID="${AZVISION_WORKSPACE_ID:-local-demo}"
RESOURCE_GROUP_LIMIT="${AZVISION_COST_REPORT_RG_LIMIT:-5}"
RESOURCE_LIMIT="${AZVISION_COST_REPORT_RESOURCE_LIMIT:-10}"
OUT_DIR="${AZVISION_PROBE_OUT_DIR:-/tmp}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
TMP_DIR="$OUT_DIR/azvision_cost_report_smoke_$TIMESTAMP"

mkdir -p "$TMP_DIR"

if ! command -v curl >/dev/null 2>&1; then
  echo "curl not found"
  exit 1
fi
if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 not found"
  exit 1
fi

echo "== AzVision cost report smoke =="
echo "BASE_URL=$BASE_URL"
echo "WORKSPACE_ID=$WORKSPACE_ID"

http_code="$(curl -sS -o "$TMP_DIR/report_response.json" -w '%{http_code}' \
  "$BASE_URL/workspaces/$WORKSPACE_ID/cost/report?resource_group_limit=$RESOURCE_GROUP_LIMIT&resource_limit=$RESOURCE_LIMIT")"

python3 - "$TMP_DIR/report_response.json" "$http_code" "$WORKSPACE_ID" <<'PY'
import json, sys
body_file, http_code, workspace_id = sys.argv[1:4]
with open(body_file, 'r', encoding='utf-8') as f:
    payload = json.load(f)
assert int(http_code) == 200, f"cost report: expected HTTP 200, got {http_code}"
assert payload.get('ok') is True, 'cost report: expected ok=true'
assert payload.get('workspace_id') == workspace_id, 'cost report: workspace_id mismatch'
assert payload.get('report_type') == 'markdown', 'cost report: report_type mismatch'
content = payload.get('content') or ''
assert content.startswith(f'# AzVision Cost Summary — {workspace_id}'), 'cost report: title missing from markdown'
assert 'Azure Cost Management dollar amounts' in content, 'cost report: guardrail missing'
assert isinstance(payload.get('warnings'), list) and payload['warnings'], 'cost report: expected warnings[]'
print(f"[report] markdown_bytes={len(content.encode('utf-8'))} warnings={len(payload['warnings'])}")
PY

echo "PASS: AzVision cost report smoke completed"
