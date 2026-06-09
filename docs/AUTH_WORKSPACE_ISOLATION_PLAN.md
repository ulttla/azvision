# Auth and Workspace Isolation Plan

This plan defines the minimum account and workspace boundary needed before AzVision can accept external public beta users.

## Current state

- Workspace APIs return a local scaffold workspace.
- The `workspaces` table exists, but workspace lifecycle is not yet the public security boundary.
- `credential_profiles` exists in DDL, but there is no public route or ownership model.
- Current workspace ids are project/scope selectors for a single-user deployment.

## Target model

Public beta should introduce these concepts:

| Entity | Purpose | Notes |
| --- | --- | --- |
| Account | Human user identity | Owns sessions and memberships |
| Session | Browser/API login state | Expiring, revocable, secure cookie or bearer token |
| Workspace | Product data boundary | Contains topology, snapshots, exports, simulations, and Copilot history |
| Workspace member | Account to workspace mapping | Defines role and access |
| Credential profile | Backend-only Azure credential metadata | Never exposes secret values to frontend |
| Audit event | Security and data-change trail | Uses safe metadata only |

## Minimum roles

| Role | Allowed actions |
| --- | --- |
| Owner | Manage workspace, credential profile metadata, snapshots, exports, members |
| Viewer | Read topology, snapshots, reports, and Copilot output |

Azure write/remediation is not part of this model.

## API boundary rules

Every workspace-scoped API should enforce:

1. Request has a valid session.
2. Session maps to an account.
3. Account is a member of the requested workspace.
4. The requested action is allowed by the member role.
5. Response never includes provider keys, certificate passwords, or raw credential material.

Routes that need this gate include:

- `/workspaces/{workspace_id}`
- topology and inventory routes
- snapshots and topology archive routes
- exports
- simulations
- cost routes
- Copilot routes
- future credential profile routes

## Data model additions

Suggested future tables:

```text
accounts(id, email, display_name, created_at, disabled_at)
sessions(id, account_id, token_hash, created_at, expires_at, revoked_at)
workspace_members(id, workspace_id, account_id, role, created_at)
audit_events(id, workspace_id, account_id, event_type, request_id, outcome, created_at, metadata_json)
```

The existing `credential_profiles` table should gain an owner/workspace constraint and secret-storage pointer only. Secret values should live in the deployment secret store, not SQLite plaintext.

## Isolation test matrix

Before public beta, add tests for:

| Test | Expected result |
| --- | --- |
| User A lists own workspaces | Only User A memberships returned |
| User A reads User B workspace | 403 or 404 without data leak |
| Viewer tries to change credential profile | Forbidden |
| Owner updates workspace metadata | Allowed and audited |
| Missing session calls workspace API | 401 |
| Invalid workspace id | No cross-workspace detail leak |
| Copilot call in workspace | Uses only that workspace context |
| Export request | Requires membership and audit event |

## Implementation baseline

C2 started the route-agnostic guard layer in `backend/app/api/workspace_security.py`. The first contract tests in `backend/tests/test_workspace_security.py` lock these minimum rules before session persistence is wired into routes:

- Missing auth context returns `401`.
- Cross-workspace access returns `403` without echoing the requested workspace id.
- Owner can read/manage its workspace.
- Viewer can read only and cannot write/manage.
- Workspace routes now use a local-demo FastAPI dependency seam, covered by `backend/tests/test_workspaces_route_security.py`, so the future session-backed dependency can replace it without changing route contracts.
- Scan routes now use the same seam, covered by `backend/tests/test_scans_route_security.py`; cross-workspace scan requests are denied before inventory collection starts.
- Export routes now use the same seam, covered by `backend/tests/test_exports.py`; cross-workspace file creation/list/get requests are denied before payload validation or filesystem access.
- Current workspace-scoped inventory, topology, snapshots, simulations, cost, Copilot workspace chat, and path-analysis routes now use the same membership seam, covered by `backend/tests/test_workspace_isolation_contract.py` cross-workspace denial tests.
- Mutation-sensitive manual topology, snapshot, and simulation endpoints also have first-pass write-level owner/viewer checks through `require_workspace_write_membership()`.
- Account, session, workspace member, audit event, and credential profile ownership columns now exist in the SQLite DDL.
- `get_workspace_access_context()` can resolve bearer-token sessions by SHA-256 token hash, reject revoked/expired/disabled sessions with `401`, and hydrate workspace memberships from `workspace_members`; requests without a bearer token still fall back to local-demo compatibility until login routes exist.
- `/auth/dev-session` can issue a local development bearer token only when `AZVISION_AUTH_DEV_SESSION_ENABLED=true`; it is disabled by default, is not a public login flow, derives account ids server-side from email, and writes an `auth.dev_session.created` audit event without token leakage.
- `/auth/oidc/session` is the real login entrypoint contract: disabled by default, fails closed when the verifier or workspace mapping is not configured, and only issues a session after a verified identity plus resolved workspace grant are supplied by server-side seams. The verifier requires configured issuer, audience, and JWKS URL and performs RS256/JWKS validation before claims are trusted. Initial workspace mapping uses an explicit server-side JSON allowlist, validates shape/roles up front, and ignores caller-supplied role claims.
- `/auth/config-check` now reports OIDC readiness with non-secret booleans and counts only: login enabled, issuer/audience/JWKS presence, workspace map presence/validity, mapped user count, and grant count. It also reports account lifecycle readiness with `dev_session_enabled`, `oidc_login_enabled`, `account_management_enabled`, and `public_routes_fail_closed`, plus shared limiter readiness booleans/counts. It does not echo issuer, audience, JWKS URL, mapped email, workspace IDs, provider names, or secrets.
- Session issuance persistence is isolated in `app.auth.session_issuer.issue_workspace_session()`: callers receive the raw bearer token once, while SQLite stores only the SHA-256 token hash plus account/workspace membership rows.
- Account lifecycle foundation now includes `disable_account_sessions()`, which marks an account disabled and revokes active sessions in one helper for future invite/disable/admin flows.
- A disabled-by-default self-disable route exists at `/auth/account/disable` behind `AZVISION_AUTH_ACCOUNT_MANAGEMENT_ENABLED`. It revokes the current account sessions, emits `auth.account.disabled` with non-secret count metadata, and remains hidden until explicitly enabled.
- Expired sessions and disabled accounts are rejected at HTTP level with `401` tests.
- `/auth/me` returns the current bearer session account and workspace memberships without echoing the token; missing bearer tokens are rejected with `401`.
- `/auth/logout` revokes the current bearer session, writes `auth.session.revoked`, and rejects later use of the same token.
- `backend/tests/test_workspace_session_security.py` covers member allow, non-member deny without workspace id leak, invalid/expired/disabled/revoked token `401`, viewer write denial, no-token local-demo compatibility, disabled dev-session behavior, enabled owner token access, enabled viewer write denial, `/auth/me`, and `/auth/logout`.

Credential profile route contracts now cover owner create/list/update/delete, viewer create/update/delete denial, cross-workspace list denial without id leak, required `secret_ref`, soft delete, and rejection of sensitive metadata keys. Creation/update/delete write non-secret `credential_profile.*` audit events. Workspace create/update write non-secret workspace audit events containing field names only. Export creation writes a non-secret `export.created` audit event without persisting the image payload in audit metadata. Snapshot restore/delete actions write `snapshot.restore_recorded` and `snapshot.deleted` audit events.

This is not yet full public beta auth. It is a route-level isolation, session lookup, local dev-session, OIDC entrypoint/verifier/mapping contract, credential ownership, OIDC/account-lifecycle readiness visibility, provider-safe frontend readiness scaffolding, and audit-write contract slice. Public beta still needs operator account lifecycle decisions, provider-specific values to be selected/entered for the target environment, and shared rate-limit enforcement evidence before exposure. The session persistence path itself is already tested and reused by the OIDC entrypoint contract.

## Migration approach

1. Keep `local-demo` compatibility for personal-use mode.
2. Configure provider-specific OIDC issuer/audience/JWKS/workspace-map values behind `/auth/oidc/session` and keep raw bearer tokens one-time only.
3. Define account lifecycle UX beyond the JSON allowlist: invite, disable, membership role changes, and operator approval language. The self-disable route contract exists but remains disabled by default; broader account management routes are not approved yet.
4. Decide credential-profile cross-owner policy inside one workspace: owner-only self-management vs workspace-owner manage-all with explicit audit reason.
5. Flip public beta profile to require auth and disable local-demo fallback for public routes.
6. Add cross-workspace and token lifecycle regression tests before any hosted beta.

## Public beta go/no-go

No-go if any of these are true:

- Workspace id alone grants access.
- Credential profile data can be read without owner membership.
- Secret values can appear in API responses, logs, exports, or Copilot prompts.
- A viewer role can mutate workspace security settings.
- Public beta deployment can run with wildcard allowed hosts and debug enabled.
