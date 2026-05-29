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
| G1 | Auth, account, workspace isolation | partial | `docs/AUTH_WORKSPACE_ISOLATION_PLAN.md`, `backend/app/api/workspace_security.py`, `backend/app/api/routes/auth.py`, `backend/app/api/routes/workspaces.py`, `backend/app/api/routes/exports.py`, `backend/app/db/models.py`, `backend/tests/test_workspace_security.py`, `backend/tests/test_workspaces_route_security.py`, `backend/tests/test_scans_route_security.py`, `backend/tests/test_exports.py`, `backend/tests/test_workspace_isolation_contract.py`, `backend/tests/test_workspace_session_security.py`, `backend/tests/test_credential_profiles_model.py`, `backend/tests/test_credential_profiles_routes.py` | Session/account lookup seam exists for bearer-token sessions and workspace memberships; local dev-session issuance is disabled by default and writes a non-secret audit event; credential profile table and create/list/update/delete routes now enforce workspace owner boundaries, soft delete, audit writes, and secret metadata rejection; export creation now writes a non-secret audit event; remaining gate is real login/session issuance and broader audit event coverage before public exposure |
| G2 | Production-like deployment profile | partial | `docker-compose.production.example.yml`, production Dockerfiles, `scripts/production_profile_smoke.sh`, CI contract smoke | Run private production-like environment and hosted E2E smoke |
| G3 | API protection and audit trail | partial | `X-Request-ID`, safe request logging, `build_rate_limited_response()`, `docs/RATE_LIMIT_AUDIT_PLAN.md` | Implement actual limiter and audit event storage after identity model |
| G4 | Public onboarding and demo workspace | partial | `docs/ONBOARDING_DESIGN.md`, `docs/DEMO_WORKSPACE_CONTRACT.md`, backend demo contract tests | Add first-run UI and demo workspace CTA |
| G5 | Hosted E2E preflight | partial | `docs/HOSTED_E2E_PREFLIGHT_PLAN.md`, `scripts/hosted_public_beta_smoke.mjs`, CI contract check | Execute against private hosted profile before exposure |
| G6 | Real cost ingestion | deferred | `docs/COST_INGESTION_PUBLIC_BETA_PLAN.md`, noop provider labels unknown cost data | Implement provider only if beta claims real billing data |
| G7 | Copilot persistence | deferred | `docs/COPILOT_PERSISTENCE_PLAN.md`, stateless/read-only Copilot baseline | Add persistence only after auth/workspace isolation |
| G8 | Retention write-mode | deferred | `docs/RETENTION_EXECUTION_GUARD.md`, dry-run-only retention selector | Add explicit approval-gated prune path only if needed |
| G9 | Public API/user docs and changelog | partial | public beta docs index now exists across readiness docs | Add user-facing quick start and changelog before beta announcement |

## Entry criteria snapshot

Public beta remains **not ready** until at least:

1. G1 auth/workspace isolation route guard seam remains in place, and auth/session lookup plus session issuance are implemented and tested on top of it.
2. G2 private production-like environment is run successfully.
3. G5 hosted E2E smoke passes against that private environment.
4. G3 actual rate limiting exists for public-abuse-sensitive routes.
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

## Current recommendation

Next product-track slice should continue G1 by adding real login/session issuance and broader audit event writes on top of the new session lookup seam. The dev-session endpoint is local-only and disabled by default, so it is not a public login substitute. G2/G5 can continue in parallel only as private environment validation; do not expose AzVision publicly before full G1 session auth is in place.
