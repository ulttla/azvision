# Public Beta Blocker Status

This table summarizes the public beta blocker state after the C1 public readiness work. It is a live planning index, not a launch approval. Final approval gate template: `docs/PUBLIC_BETA_APPROVAL_GATE.md`.

## Status legend

| Status | Meaning |
| --- | --- |
| `done` | Contract, code, or smoke baseline exists and is in CI where appropriate |
| `partial` | Planning or guard exists, but implementation is not complete |
| `blocked` | Public beta cannot proceed without this work |
| `deferred` | Not required for first public beta if clearly labeled or gated |

## Blocker table

| ID | Area | Current status | Evidence | Remaining gate |
| --- | --- | --- | --- | --- |
| G1 | Auth, account, workspace isolation | partial | `docs/AUTH_WORKSPACE_ISOLATION_PLAN.md`, `backend/app/api/workspace_security.py`, `backend/app/api/routes/auth.py`, `backend/app/api/routes/workspaces.py`, `backend/app/api/routes/exports.py`, `backend/app/api/routes/snapshots.py`, `backend/app/auth/oidc_login.py`, `backend/app/auth/session_issuer.py`, `backend/app/db/models.py`, `backend/tests/test_workspace_security.py`, `backend/tests/test_workspaces_route_security.py`, `backend/tests/test_scans_route_security.py`, `backend/tests/test_exports.py`, `backend/tests/test_snapshots.py`, `backend/tests/test_session_issuer.py`, `backend/tests/test_oidc_login.py`, `backend/tests/test_oidc_session_route.py`, `backend/tests/test_workspace_isolation_contract.py`, `backend/tests/test_workspace_session_security.py`, `backend/tests/test_credential_profiles_model.py`, `backend/tests/test_credential_profiles_routes.py`, `backend/tests/test_auth.py` | Session/account lookup seam exists for bearer-token sessions and workspace memberships; `/auth/me` exposes current account/memberships without token echo; expired/disabled/revoked sessions are denied; session issuance/revocation helper stores only token hashes; account disable/revoke helper and disabled-by-default `/auth/account/disable` self-disable route contract exist for future lifecycle flows; local dev-session issuance is disabled by default; `/auth/oidc/session` is disabled by default, uses issuer/audience/JWKS verification before trusting claims, and maps only validated explicit server-side JSON workspace grants while ignoring caller-supplied role claims; `/auth/config-check` now reports OIDC readiness with non-secret booleans/counts only; workspace create/update and credential profile table/routes enforce workspace owner boundaries, soft delete, audit writes, and secret metadata rejection; remaining gate is broader account lifecycle UX/route authorization, provider-specific target values, and shared limiter evidence before public exposure |
| G2 | Production-like deployment profile | partial | `docker-compose.production.example.yml`, production Dockerfiles, `scripts/production_profile_smoke.sh`, CI contract smoke | Run private production-like environment and hosted E2E smoke |
| G3 | API protection and audit trail | partial | `X-Request-ID`, safe request logging, `build_rate_limited_response()`, `InMemoryRateLimiter` behind `AZVISION_RATE_LIMIT_ENABLED`, OIDC session-specific limiter bucket, shared enforcement runbook, non-secret `/auth/config-check` shared limiter readiness reporting, indexed `audit_events` table, `record_audit_event()`, OIDC login failure/success and workspace/credential/export/snapshot create/update/delete/restore/topology-archive/copilot/scan/manual-topology/simulation audit tests, `docs/RATE_LIMIT_AUDIT_PLAN.md`, `docs/SHARED_LIMITER_EVIDENCE_TEMPLATE.md`, `backend/tests/test_rate_limit_middleware.py`, `backend/tests/test_public_beta_audit_routes.py`, `backend/tests/test_snapshots.py`, `backend/tests/test_auth.py` | Enable shared storage/gateway enforcement for multi-instance public traffic and capture provider-specific limiter evidence |
| G4 | Public onboarding and demo workspace | done | `docs/ONBOARDING_DESIGN.md`, `docs/DEMO_WORKSPACE_CONTRACT.md`, backend demo contract tests, idempotent demo status/bootstrap route tests, `backend/app/api/routes/workspaces.py`, `backend/tests/test_workspaces_route_security.py`, `frontend/src/App.tsx`, `scripts/app_shell_semantics_smoke.mts`, `docs/PUBLIC_BETA_QUICK_START.md` | Keep public exposure separate; first-run UI/demo CTA and backend demo route contract now exist |
| G5 | Hosted E2E preflight | partial | `docs/HOSTED_E2E_PREFLIGHT_PLAN.md`, `scripts/hosted_public_beta_smoke.mjs`, CI contract check | Execute against private hosted profile before exposure |
| G6 | Real cost ingestion | deferred | `docs/COST_INGESTION_PUBLIC_BETA_PLAN.md`, noop provider labels unknown cost data | Implement provider only if beta claims real billing data |
| G7 | Copilot persistence | deferred | `docs/COPILOT_PERSISTENCE_PLAN.md`, stateless/read-only Copilot baseline | Add persistence only after auth/workspace isolation |
| G8 | Retention write-mode | deferred | `docs/RETENTION_EXECUTION_GUARD.md`, dry-run-only retention selector | Add explicit approval-gated prune path only if needed |
| G9 | Public API/user docs and changelog | done | `docs/PUBLIC_BETA_QUICK_START.md`, `docs/PUBLIC_BETA_CHANGELOG.md`, `docs/PUBLIC_BETA_C1_EVIDENCE.md`, `docs/PUBLIC_BETA_APPROVAL_GATE.md`, `docs/README.md` | Keep announcement/release approval separate from docs completeness |

## Entry criteria snapshot

Public beta remains **not ready** until at least:

1. G1 auth/workspace isolation account lifecycle/provider target values are selected and wired behind the tested `/auth/oidc/session` entrypoint and session lookup/issuance/revocation seam.
2. G2 private production-like environment is run successfully.
3. G5 hosted E2E smoke passes against that private environment.
4. G3 rate limiting is enabled with shared storage/gateway enforcement for public-abuse-sensitive routes.

## Completed in C1

- Public beta gap and launch risk table.
- Security hardening baseline with safe debug default, CSP/HSTS/security headers.
- Request id response header and safe request metadata logging.
- Stable rate-limit response helper contract.
- Production-like file/profile skeleton and CI smoke.
- Demo workspace backend contract and guard tests.
- Cost, Copilot persistence, retention write-mode boundary docs.
- Hosted E2E preflight plan and fail-closed smoke skeleton.
- Public beta contract smokes wired into GitHub CI.
- Workspace route guard coverage expanded across current workspace-scoped routes.
- Bearer session lookup, dev-session issue/use/me/logout/reuse-deny contract, and hash-only session persistence helper.
- Credential profile ownership schema and create/list/update/delete route contracts with non-secret audit events.
- Non-secret audit events for auth session actions, workspace management, export creation, snapshot restore/delete, Copilot chat, scan start, manual topology mutations, and simulation create/delete.
- Public beta quick start/changelog docs and first-run demo CTA card in the app shell.

## Current recommendation

Next product-track slice should continue G1 by adding account lifecycle/provider config hardening and G3 shared-storage/gateway rate-limit enforcement evidence on top of the session lookup/issuance seam. The dev-session endpoint is local-only and disabled by default, so it is not a public login substitute. G2/G5 can continue in parallel only as private environment validation; do not expose AzVision publicly before full G1 session auth is in place.
