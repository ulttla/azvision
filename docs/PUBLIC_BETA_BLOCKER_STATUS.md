# Public Beta Blocker Status

This table summarizes the public beta blocker state after the C1 public readiness work. It is a live planning index, not a launch approval.

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
| G1 | Auth, account, workspace isolation | partial | `docs/AUTH_WORKSPACE_ISOLATION_PLAN.md`, `backend/app/api/workspace_security.py`, `backend/app/api/routes/auth.py`, `backend/app/api/routes/workspaces.py`, `backend/app/api/routes/exports.py`, `backend/app/api/routes/snapshots.py`, `backend/app/auth/oidc_login.py`, `backend/app/auth/session_issuer.py`, `backend/app/db/models.py`, `backend/tests/test_workspace_security.py`, `backend/tests/test_workspaces_route_security.py`, `backend/tests/test_scans_route_security.py`, `backend/tests/test_exports.py`, `backend/tests/test_snapshots.py`, `backend/tests/test_session_issuer.py`, `backend/tests/test_oidc_session_route.py`, `backend/tests/test_workspace_isolation_contract.py`, `backend/tests/test_workspace_session_security.py`, `backend/tests/test_credential_profiles_model.py`, `backend/tests/test_credential_profiles_routes.py` | Session/account lookup seam exists for bearer-token sessions and workspace memberships; `/auth/me` exposes current account/memberships without token echo; expired/disabled/revoked sessions are denied; session issuance/revocation helper stores only token hashes; local dev-session issuance is disabled by default; `/auth/oidc/session` contract is disabled by default and fails closed unless server-side verifier and workspace grant seams succeed; workspace create/update and credential profile table/routes enforce workspace owner boundaries, soft delete, audit writes, and secret metadata rejection; export creation plus snapshot restore/delete now write non-secret audit events; remaining gate is production OIDC verifier/JWKS/audience implementation and broader audit event coverage before public exposure |
| G2 | Production-like deployment profile | partial | `docker-compose.production.example.yml`, production Dockerfiles, `scripts/production_profile_smoke.sh`, CI contract smoke | Run private production-like environment and hosted E2E smoke |
| G3 | API protection and audit trail | partial | `X-Request-ID`, safe request logging, `build_rate_limited_response()`, `InMemoryRateLimiter` behind `AZVISION_RATE_LIMIT_ENABLED`, indexed `audit_events` table, `record_audit_event()`, auth/session/workspace/credential/export/snapshot audit tests, `docs/RATE_LIMIT_AUDIT_PLAN.md`, `backend/tests/test_rate_limit_middleware.py` | Replace process-local limiter with shared storage/gateway enforcement for multi-instance public traffic and finish audit coverage for remaining public-abuse-sensitive routes |
| G4 | Public onboarding and demo workspace | partial | `docs/ONBOARDING_DESIGN.md`, `docs/DEMO_WORKSPACE_CONTRACT.md`, backend demo contract tests | Add first-run UI and demo workspace CTA |
| G5 | Hosted E2E preflight | partial | `docs/HOSTED_E2E_PREFLIGHT_PLAN.md`, `scripts/hosted_public_beta_smoke.mjs`, CI contract check | Execute against private hosted profile before exposure |
| G6 | Real cost ingestion | deferred | `docs/COST_INGESTION_PUBLIC_BETA_PLAN.md`, noop provider labels unknown cost data | Implement provider only if beta claims real billing data |
| G7 | Copilot persistence | deferred | `docs/COPILOT_PERSISTENCE_PLAN.md`, stateless/read-only Copilot baseline | Add persistence only after auth/workspace isolation |
| G8 | Retention write-mode | deferred | `docs/RETENTION_EXECUTION_GUARD.md`, dry-run-only retention selector | Add explicit approval-gated prune path only if needed |
| G9 | Public API/user docs and changelog | partial | public beta docs index now exists across readiness docs | Add user-facing quick start and changelog before beta announcement |

## Entry criteria snapshot

Public beta remains **not ready** until at least:

1. G1 auth/workspace isolation production OIDC verifier/JWKS/audience checks are wired behind the tested `/auth/oidc/session` entrypoint and session lookup/issuance/revocation seam.
2. G2 private production-like environment is run successfully.
3. G5 hosted E2E smoke passes against that private environment.
4. G3 rate limiting is enabled with shared storage/gateway enforcement for public-abuse-sensitive routes.
5. G4 first-run demo path is visible in UI.

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
- Non-secret audit events for auth session actions, workspace management, export creation, snapshot restore/delete.

## Current recommendation

Next product-track slice should continue G1 by adding the production OIDC verifier/JWKS/audience implementation and G3 shared-storage/gateway rate-limit enforcement on top of the session lookup/issuance seam. The dev-session endpoint is local-only and disabled by default, so it is not a public login substitute. G2/G5 can continue in parallel only as private environment validation; do not expose AzVision publicly before full G1 session auth is in place.
