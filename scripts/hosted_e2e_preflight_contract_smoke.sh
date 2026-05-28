#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

required_files=(
  docs/HOSTED_E2E_PREFLIGHT_PLAN.md
  docs/PRODUCTION_DEPLOYMENT_GUIDE.md
  docs/DEMO_WORKSPACE_CONTRACT.md
  docs/SECURITY_HARDENING.md
  scripts/hosted_public_beta_smoke.mjs
)

for file in "${required_files[@]}"; do
  if [[ ! -s "$file" ]]; then
    echo "[fail] missing hosted E2E contract dependency: $file" >&2
    exit 1
  fi
  echo "[ok] $file"
done

grep -q 'AZVISION_HOSTED_BASE_URL' docs/HOSTED_E2E_PREFLIGHT_PLAN.md
grep -q 'AZVISION_HOSTED_API_BASE_URL' docs/HOSTED_E2E_PREFLIGHT_PLAN.md
grep -q 'X-Request-ID' docs/HOSTED_E2E_PREFLIGHT_PLAN.md
grep -q 'demo workspace loads without Azure credentials' docs/HOSTED_E2E_PREFLIGHT_PLAN.md
grep -q 'No public DNS or open internet exposure' docs/HOSTED_E2E_PREFLIGHT_PLAN.md
grep -q 'No real Azure write/remediation' docs/HOSTED_E2E_PREFLIGHT_PLAN.md
node scripts/hosted_public_beta_smoke.mjs --contract-check >/dev/null

echo 'PASS: AzVision hosted E2E preflight contract smoke completed'
