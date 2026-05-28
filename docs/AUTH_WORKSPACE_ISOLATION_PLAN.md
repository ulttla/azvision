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

This is not yet full public beta auth. It is the first safe contract slice for the later FastAPI dependency and route integration.

## Migration approach

1. Add models and repository layer behind feature flag or local-only default.
2. Keep `local-demo` compatibility for personal-use mode.
3. Add auth dependency in no-op local mode first.
4. Add session implementation.
5. Flip public beta profile to require auth.
6. Add cross-workspace regression tests before any hosted beta.

## Public beta go/no-go

No-go if any of these are true:

- Workspace id alone grants access.
- Credential profile data can be read without owner membership.
- Secret values can appear in API responses, logs, exports, or Copilot prompts.
- A viewer role can mutate workspace security settings.
- Public beta deployment can run with wildcard allowed hosts and debug enabled.
