#!/bin/bash
set -euo pipefail

BASE_URL="${AZVISION_API_BASE_URL:-http://127.0.0.1:8000/api/v1}"
WORKSPACE_ID="${AZVISION_WORKSPACE_ID:-local-demo}"
OUT_DIR="${AZVISION_PROBE_OUT_DIR:-/tmp}"
CURL_MAX_TIME="${AZVISION_CURL_MAX_TIME:-30}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
TMP_DIR="$OUT_DIR/azvision_copilot_provider_smoke_$TIMESTAMP"

mkdir -p "$TMP_DIR"

if ! command -v curl >/dev/null 2>&1; then
  echo "curl not found"
  exit 1
fi
if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 not found"
  exit 1
fi

echo "== AzVision copilot provider smoke =="
echo "BASE_URL=$BASE_URL"
echo "WORKSPACE_ID=$WORKSPACE_ID"

authless_get() {
  local path="$1"
  local output="$2"
  curl --max-time "$CURL_MAX_TIME" -sS -o "$output" -w '%{http_code}' "$BASE_URL$path"
}

providers_code="$(authless_get "/copilot/providers" "$TMP_DIR/providers.json")"
health_code="$(authless_get "/copilot/providers?health_smoke=true" "$TMP_DIR/providers_health.json")"
chat_code="$(curl --max-time "$CURL_MAX_TIME" -sS -o "$TMP_DIR/chat.json" -w '%{http_code}' \
  -X POST "$BASE_URL/workspaces/$WORKSPACE_ID/chat?resource_group_limit=5&resource_limit=10" \
  -H 'Content-Type: application/json' \
  --data '{"message":"Summarize read-only copilot status","provider":"rule-based","current_view":"cost-insights"}')"

python3 - "$TMP_DIR" "$providers_code" "$health_code" "$chat_code" "$WORKSPACE_ID" <<'PY'
import json, pathlib, re, sys
base = pathlib.Path(sys.argv[1])
providers_code, health_code, chat_code = map(int, sys.argv[2:5])
workspace_id = sys.argv[5]

providers = json.loads((base / 'providers.json').read_text())
health = json.loads((base / 'providers_health.json').read_text())
chat = json.loads((base / 'chat.json').read_text())

assert providers_code == 200, f'providers HTTP {providers_code}: {providers}'
assert health_code == 200, f'provider health HTTP {health_code}: {health}'
assert chat_code == 200, f'chat HTTP {chat_code}: {chat}'

assert providers.get('ok') is True
assert providers.get('read_only') is True
assert isinstance(providers.get('providers'), list)
assert any(item.get('id') == 'rule-based' and item.get('configured') is True for item in providers['providers'])
assert 'provider_health' not in providers

assert health.get('ok') is True
assert health.get('read_only') is True
assert 'provider_health' in health
for provider in ('ollama', 'openrouter'):
    signal = health['provider_health'].get(provider) or {}
    assert set(signal).issuperset({'configured', 'reachable', 'detail', 'model'}), signal
    assert signal.get('detail') in {'reachable', 'unreachable', 'not_configured'}, signal

assert chat.get('ok') is True
assert chat.get('workspace_id') == workspace_id
assert chat.get('read_only') is True
assert chat.get('provider') == 'rule-based'
assert chat.get('llm_status') in {'not_configured', 'missing_config', 'ok', 'ollama_provider_error'}
assert chat.get('answer')
assert isinstance(chat.get('suggestions'), list)

serialized = json.dumps({'providers': providers, 'health': health, 'chat': chat}, ensure_ascii=False)
secret_patterns = [r'sk-[A-Za-z0-9_-]{8,}', r'Bearer\s+[A-Za-z0-9._-]+', r'OPENROUTER_API_KEY\s*=']
for pattern in secret_patterns:
    assert not re.search(pattern, serialized), f'secret-like value leaked: {pattern}'

print('[copilot] providers={providers} health={health_keys} chat_provider={provider} llm_status={status}'.format(
    providers=len(providers.get('providers') or []),
    health_keys=','.join(sorted((health.get('provider_health') or {}).keys())),
    provider=chat.get('provider'),
    status=chat.get('llm_status'),
))
PY

echo "Artifacts: $TMP_DIR"
