#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

required_docs=(
  docs/PUBLIC_BETA_GAP_ANALYSIS.md
  docs/AUTH_WORKSPACE_ISOLATION_PLAN.md
  docs/PRODUCTION_DEPLOYMENT_GUIDE.md
  docs/SECURITY_HARDENING.md
  docs/ONBOARDING_DESIGN.md
  docs/DEMO_WORKSPACE_CONTRACT.md
  docs/RATE_LIMIT_AUDIT_PLAN.md
  docs/COST_INGESTION_PUBLIC_BETA_PLAN.md
  docs/COPILOT_PERSISTENCE_PLAN.md
  docs/RETENTION_EXECUTION_GUARD.md
  docs/HOSTED_E2E_PREFLIGHT_PLAN.md
)

for file in "${required_docs[@]}"; do
  if [[ ! -s "$file" ]]; then
    echo "[fail] missing public beta contract doc: $file" >&2
    exit 1
  fi
  echo "[ok] $file"
done

grep -q 'unknown-cost-data' docs/COST_INGESTION_PUBLIC_BETA_PLAN.md
grep -q 'actual-cost-data' docs/COST_INGESTION_PUBLIC_BETA_PLAN.md
grep -q 'chat history is not saved' docs/COPILOT_PERSISTENCE_PLAN.md
grep -q 'No shared chat history before workspace isolation' docs/COPILOT_PERSISTENCE_PLAN.md
grep -q 'No deletion from cron' docs/RETENTION_EXECUTION_GUARD.md
grep -q -- '--dry-run' scripts/archive_retention_dry_run.py
grep -q 'No-go criteria' docs/RATE_LIMIT_AUDIT_PLAN.md
grep -q 'No public DNS or open internet exposure' docs/HOSTED_E2E_PREFLIGHT_PLAN.md

echo 'PASS: AzVision public beta contract smoke completed'
