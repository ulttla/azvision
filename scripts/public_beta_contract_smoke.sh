#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

required_docs=(
  docs/PUBLIC_BETA_GAP_ANALYSIS.md
  docs/PUBLIC_BETA_APPROVAL_GATE.md
  docs/AUTH_WORKSPACE_ISOLATION_PLAN.md
  docs/PRODUCTION_DEPLOYMENT_GUIDE.md
  docs/SECURITY_HARDENING.md
  docs/ONBOARDING_DESIGN.md
  docs/DEMO_WORKSPACE_CONTRACT.md
  docs/RATE_LIMIT_AUDIT_PLAN.md
  docs/SHARED_LIMITER_EVIDENCE_TEMPLATE.md
  docs/COST_INGESTION_PUBLIC_BETA_PLAN.md
  docs/COPILOT_PERSISTENCE_PLAN.md
  docs/RETENTION_EXECUTION_GUARD.md
  docs/HOSTED_E2E_PREFLIGHT_PLAN.md
  docs/HOSTED_E2E_RUN_RECORD_TEMPLATE.md
  docs/PUBLIC_BETA_BLOCKER_STATUS.md
  docs/PUBLIC_BETA_QUICK_START.md
  docs/PUBLIC_BETA_CHANGELOG.md
  docs/PUBLIC_BETA_C1_EVIDENCE.md
  docs/PUBLIC_BETA_C2_EVIDENCE.md
  docs/PUBLIC_BETA_C3_EVIDENCE.md
  docs/ACCOUNT_LIFECYCLE_DECISION_TEMPLATE.md
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
grep -q 'provider-only or enforced-only states remain blocked' docs/RATE_LIMIT_AUDIT_PLAN.md
grep -q 'Current recommendation' docs/PUBLIC_BETA_APPROVAL_GATE.md
grep -q 'Public exposure remains blocked' docs/PUBLIC_BETA_APPROVAL_GATE.md
grep -q 'Public exposure approved by this run: \*\*No\*\*' docs/SHARED_LIMITER_EVIDENCE_TEMPLATE.md
grep -q 'C1 application-side limiter readiness' docs/SHARED_LIMITER_EVIDENCE_TEMPLATE.md
grep -q 'public_beta_shared_gate_satisfied' docs/SHARED_LIMITER_EVIDENCE_TEMPLATE.md
grep -q 'No public DNS or open internet exposure' docs/HOSTED_E2E_PREFLIGHT_PLAN.md
grep -q 'Public exposure approved by this run: \*\*No\*\*' docs/HOSTED_E2E_RUN_RECORD_TEMPLATE.md
grep -q 'Gun approved this private target' docs/HOSTED_E2E_RUN_RECORD_TEMPLATE.md
grep -q 'C1 CI-backed readiness evidence' docs/HOSTED_E2E_PREFLIGHT_PLAN.md
grep -q -- '--json' scripts/hosted_public_beta_smoke.mjs
grep -q 'Public beta remains' docs/PUBLIC_BETA_BLOCKER_STATUS.md
grep -q 'G1 auth/workspace isolation' docs/PUBLIC_BETA_BLOCKER_STATUS.md
grep -q 'Not approved here' docs/PUBLIC_BETA_C1_EVIDENCE.md
grep -q 'C2 handoff criteria' docs/PUBLIC_BETA_C1_EVIDENCE.md
grep -q 'Safe same-goal work' docs/PUBLIC_BETA_C1_EVIDENCE.md
grep -q 'Approval-dependent work' docs/PUBLIC_BETA_C1_EVIDENCE.md
grep -q 'Final validation snapshot' docs/PUBLIC_BETA_C1_EVIDENCE.md
grep -q '506 passed' docs/PUBLIC_BETA_C1_EVIDENCE.md
grep -q '27171463166' docs/PUBLIC_BETA_C1_EVIDENCE.md
grep -q '27175032573' docs/PUBLIC_BETA_C1_EVIDENCE.md
grep -q '27176255081' docs/PUBLIC_BETA_C1_EVIDENCE.md
grep -q 'OIDC readiness' docs/AUTH_WORKSPACE_ISOLATION_PLAN.md
grep -q 'workspace_map_valid' backend/app/api/routes/auth.py
grep -q 'public_routes_exposure_gated' backend/app/api/routes/auth.py
grep -q 'public_routes_exposure_gated' docs/ACCOUNT_LIFECYCLE_DECISION_TEMPLATE.md
grep -q 'rate_limit_readiness_summary' backend/app/api/routes/auth.py
grep -q 'public_beta_shared_gate_satisfied' backend/app/api/rate_limiter.py
grep -q 'disable_account_sessions' backend/app/auth/session_issuer.py
grep -q 'auth_account_management_enabled' backend/app/core/config.py
grep -q 'Account Lifecycle Decision Template' docs/ACCOUNT_LIFECYCLE_DECISION_TEMPLATE.md
grep -q 'public_routes_exposure_gated' backend/app/api/routes/auth.py
grep -q 'public_routes_exposure_gated' frontend/src/App.tsx
grep -q 'C2 evidence register' docs/PUBLIC_BETA_C2_EVIDENCE.md
grep -q 'C3 evidence register' docs/PUBLIC_BETA_C3_EVIDENCE.md
grep -q 'auth.account.disabled' backend/app/api/routes/auth.py
grep -q 'demo-safe topology' docs/PUBLIC_BETA_QUICK_START.md
grep -q 'demo-status' backend/app/api/routes/workspaces.py
grep -q 'demo-bootstrap' backend/app/api/routes/workspaces.py
grep -q 'workspace.demo_bootstrapped' backend/app/api/routes/workspaces.py
grep -q 'getDemoWorkspaceStatus' frontend/src/lib/api.ts
grep -q 'bootstrapDemoWorkspace' frontend/src/lib/api.ts
grep -q 'public-beta-demo-badge' frontend/src/App.tsx
grep -q 'public-beta-onboarding' frontend/src/components/PublicBetaOnboarding.tsx
grep -q 'PublicBetaOnboarding' frontend/src/App.tsx
grep -q 'App shell public beta readiness card' docs/PUBLIC_BETA_CHANGELOG.md
grep -q 'copilot.chat.requested' backend/app/api/routes/copilot.py
grep -q 'scan.started' backend/app/api/routes/scans.py
grep -q 'manual_node.created' backend/app/api/routes/topology.py
grep -q 'manual_node.updated' backend/app/api/routes/topology.py
grep -q 'manual_node.deleted' backend/app/api/routes/topology.py
grep -q 'manual_edge.created' backend/app/api/routes/topology.py
grep -q 'manual_edge.updated' backend/app/api/routes/topology.py
grep -q 'manual_edge.deleted' backend/app/api/routes/topology.py
grep -q 'simulation.created' backend/app/api/routes/simulations.py
grep -q 'simulation.deleted' backend/app/api/routes/simulations.py
grep -q 'snapshot.created' backend/app/api/routes/snapshots.py
grep -q 'snapshot.updated' backend/app/api/routes/snapshots.py
grep -q 'snapshot.topology_archived' backend/app/api/routes/snapshots.py
test -s backend/app/api/workspace_security.py
test -s backend/tests/test_workspace_security.py
test -s backend/tests/test_workspaces_route_security.py
test -s backend/tests/test_scans_route_security.py
grep -q 'Workspace access denied' backend/app/api/workspace_security.py
grep -q 'test_cross_workspace_access_is_forbidden_without_identifier_leak' backend/tests/test_workspace_security.py
grep -q 'test_default_workspace_route_forbids_cross_workspace_without_id_leak' backend/tests/test_workspaces_route_security.py
grep -q 'test_scan_start_denies_cross_workspace_before_collecting_inventory' backend/tests/test_scans_route_security.py
grep -q 'test_export_create_forbids_cross_workspace_before_payload_validation' backend/tests/test_exports.py

echo 'PASS: AzVision public beta contract smoke completed'
