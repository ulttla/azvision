#!/bin/bash
set -euo pipefail

BASE_URL="${AZVISION_API_BASE_URL:-http://127.0.0.1:8000/api/v1}"
WORKSPACE_ID="${AZVISION_WORKSPACE_ID:-local-demo}"
RESOURCE_GROUP_LIMIT="${AZVISION_COST_RG_LIMIT:-5}"
RESOURCE_LIMIT="${AZVISION_COST_RESOURCE_LIMIT:-10}"
OUT_DIR="${AZVISION_PROBE_OUT_DIR:-/tmp}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
TMP_DIR="$OUT_DIR/azvision_cost_insights_smoke_$TIMESTAMP"
QUERY="resource_group_limit=$RESOURCE_GROUP_LIMIT&resource_limit=$RESOURCE_LIMIT"

mkdir -p "$TMP_DIR"

if ! command -v curl >/dev/null 2>&1; then
  echo "curl not found"
  exit 1
fi
if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 not found"
  exit 1
fi

echo "== AzVision cost insights smoke =="
echo "BASE_URL=$BASE_URL"
echo "WORKSPACE_ID=$WORKSPACE_ID"
echo "QUERY=$QUERY"

request_json() {
  local method="$1"
  local path="$2"
  local output="$3"
  if [ "$method" = "POST" ]; then
    curl -sS -o "$output" -w '%{http_code}' -X POST "$BASE_URL$path"
  else
    curl -sS -o "$output" -w '%{http_code}' "$BASE_URL$path"
  fi
}

summary_code="$(request_json GET "/workspaces/$WORKSPACE_ID/cost/summary?$QUERY" "$TMP_DIR/summary.json")"
resources_code="$(request_json GET "/workspaces/$WORKSPACE_ID/cost/resources?$QUERY" "$TMP_DIR/resources.json")"
recommendations_code="$(request_json POST "/workspaces/$WORKSPACE_ID/cost/recommendations?$QUERY" "$TMP_DIR/recommendations.json")"
report_code="$(request_json GET "/workspaces/$WORKSPACE_ID/cost/report?$QUERY" "$TMP_DIR/report.json")"

python3 - "$TMP_DIR" "$summary_code" "$resources_code" "$recommendations_code" "$report_code" "$WORKSPACE_ID" <<'PY'
import json, pathlib, sys
base = pathlib.Path(sys.argv[1])
summary_code, resources_code, recommendations_code, report_code = map(int, sys.argv[2:6])
workspace_id = sys.argv[6]

summary = json.loads((base / 'summary.json').read_text())
resources = json.loads((base / 'resources.json').read_text())
recommendations = json.loads((base / 'recommendations.json').read_text())
report = json.loads((base / 'report.json').read_text())

assert summary_code == 200, f'summary HTTP {summary_code}: {summary}'
assert resources_code == 200, f'resources HTTP {resources_code}: {resources}'
assert recommendations_code == 200, f'recommendations HTTP {recommendations_code}: {recommendations}'
assert report_code == 200, f'report HTTP {report_code}: {report}'

assert summary.get('ok') is True and summary.get('workspace_id') == workspace_id
assert resources.get('ok') is True and resources.get('workspace_id') == workspace_id
assert recommendations.get('ok') is True and recommendations.get('workspace_id') == workspace_id
assert report.get('ok') is True and report.get('workspace_id') == workspace_id

summary_body = summary.get('summary') or {}
assert summary_body.get('cost_ingestion_provider') == 'noop'
assert summary_body.get('estimated_monthly_cost') is None
assert isinstance(resources.get('items'), list)
assert isinstance(recommendations.get('items'), list)
assert report.get('report_type') == 'markdown'
assert '# AzVision Cost Summary' in (report.get('content') or '')
assert report.get('warnings'), 'expected report warnings'
print(
    '[cost] analyzed={analyzed} resources={resources} recommendations={recommendations} report_bytes={report_bytes}'.format(
        analyzed=summary_body.get('analyzed_resource_count'),
        resources=len(resources.get('items') or []),
        recommendations=len(recommendations.get('items') or []),
        report_bytes=len((report.get('content') or '').encode('utf-8')),
    )
)
PY

echo "PASS: AzVision cost insights smoke completed"
