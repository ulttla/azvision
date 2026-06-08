# Rate Limit and Audit Trail Plan

This plan defines the minimum API protection layer needed before AzVision can run a public beta.

## Current state

- Security headers and safe debug defaults are in place.
- A process-local fixed-window request limiter exists behind `AZVISION_RATE_LIMIT_ENABLED=false` by default.
- A durable SQLite `audit_events` model and route helper exist for current public beta seams.
- Public traffic should not be enabled until identity and workspace isolation exist.

## Request ID baseline

Implemented baseline:

- Every API response includes `X-Request-ID`.
- Incoming `X-Request-ID` is preserved when provided.
- Missing request IDs are generated with a `req_` prefix.

This is the first building block for structured logs, audit events, and public incident correlation.

## Structured request logging baseline

Implemented baseline:

- `azvision.request` logs one `request_completed` event per response.
- Logged metadata is limited to request id, method, path, status code, and duration.
- Request bodies, query strings, credentials, prompts, and provider payloads are not logged by this baseline.

## Rate-limit target

Initial public beta should protect these routes first:

| Route group | Limit dimension | Reason |
| --- | --- | --- |
| login/session routes | IP plus account where available | Brute-force control |
| Copilot routes | account plus workspace | Provider cost and abuse control |
| export routes | account plus workspace | File generation load control |
| topology refresh routes | account plus workspace | Azure API pressure control |
| unauthenticated public routes | IP | Basic public surface control |

## Response contract

Rate-limited responses should use the existing error envelope:

```json
{
  "ok": false,
  "status": "rate-limited",
  "message": "Too many requests. Please retry later."
}
```

HTTP status should be `429` and should include `Retry-After` when the limiter can calculate it.

Implemented response helper and middleware:

- `build_rate_limited_response()` centralizes the `429` payload.
- It preserves the stable `rate-limited` status and optional `Retry-After` header.
- `InMemoryRateLimiter` provides a process-local fixed-window limiter for auth, OIDC session login, exports, Copilot, and default route groups.
- The limiter is disabled by default and enabled with `AZVISION_RATE_LIMIT_ENABLED=true`; production should replace or front it with shared storage/gateway enforcement before multi-instance public traffic.

## Audit trail target

Audit events should be safe, structured metadata. They should not store secrets, raw prompts, Azure credential material, certificate paths, or request bodies.

Current minimum event types:

- `session.issued`
- `session.revoked`
- `auth.account.disabled`
- `auth.oidc_session.failed`
- `auth.oidc_session.succeeded`
- `workspace.created`
- `workspace.updated`
- `credential_profile.created`
- `credential_profile.updated`
- `credential_profile.deleted`
- `snapshot.created`
- `snapshot.updated`
- `snapshot.restored`
- `snapshot.deleted`
- `snapshot.topology_archived`
- `export.created`
- `copilot.chat.requested`
- `scan.started`
- `manual_node.created`
- `manual_node.updated`
- `manual_node.deleted`
- `manual_edge.created`
- `manual_edge.updated`
- `manual_edge.deleted`
- `simulation.created`
- `simulation.deleted`

Remaining audit expansion candidate after public beta auth provider selection:

- `workspace.member.changed`

## Audit event shape

```json
{
  "id": "evt_...",
  "workspace_id": "...",
  "account_id": "...",
  "event_type": "snapshot.restored",
  "request_id": "req_...",
  "outcome": "success",
  "created_at": "2026-05-28T00:00:00Z",
  "metadata": {
    "snapshot_id": "snap_..."
  }
}
```

## Shared enforcement gate

The in-app limiter is acceptable only for local development and private single-process validation. Before multi-instance or public traffic, one of these shared enforcement paths must be enabled:

| Path | Requirement | Notes |
| --- | --- | --- |
| Edge/gateway limiter | Enforce per-IP and route-group limits before traffic reaches the app | Preferred for public beta if the hosting platform supports it. Preserve the app's `429` JSON envelope where possible, or document the platform envelope as an external edge response. |
| Shared store limiter | Replace process-local buckets with Redis or equivalent shared storage | Keep `route_limit_group()`, `request_rate_limit_key()`, `Retry-After`, and the stable `rate-limited` payload contract. |
| Single-process private preview | May use `AZVISION_RATE_LIMIT_ENABLED=true` only when one backend process handles all preview traffic | Not acceptable for public beta or horizontally scaled deployment. |

Minimum public beta limits to configure at the shared layer:

| Group | App env baseline | Shared enforcement key |
| --- | --- | --- |
| `auth_oidc_session` | `AZVISION_RATE_LIMIT_AUTH_OIDC_SESSION_PER_WINDOW=10` | source IP, then account/email when available |
| `auth` | `AZVISION_RATE_LIMIT_AUTH_PER_WINDOW=20` | source IP |
| `exports` | `AZVISION_RATE_LIMIT_EXPORTS_PER_WINDOW=30` | account plus workspace |
| `copilot` | `AZVISION_RATE_LIMIT_COPILOT_PER_WINDOW=20` | account plus workspace |
| `default` | `AZVISION_RATE_LIMIT_DEFAULT_PER_WINDOW=120` | source IP or account plus workspace when available |

Runtime readiness reporting:

- `/api/v1/auth/config-check` reports rate-limit readiness using booleans and counts only.
- It exposes whether app-level limiter settings are positive, whether a shared provider is configured, and whether shared enforcement is marked active.
- It does not echo the shared provider value, request keys, account identifiers, or route-specific runtime traffic.

Provider selection guidance:

| Hosting shape | Recommended limiter | Why |
| --- | --- | --- |
| Managed platform or reverse proxy available | Edge/gateway limiter | Best first public beta path: blocks abuse before app workers, no new app storage dependency, and can be tested independently. |
| Multiple app workers without edge limiter | Redis/shared-store limiter | Keeps the app-level response contract and gives global quota across workers. |
| Single private preview process only | In-app limiter plus strict private access boundary | Acceptable only as a temporary private preview control; not a public beta control. |

Pre-exposure verification:

1. Trigger the shared limiter for each group and confirm HTTP `429` behavior.
2. Confirm `Retry-After` exists or document why the edge cannot emit it.
3. Confirm request logs include `X-Request-ID` and do not include tokens, prompts, or credentials.
4. Confirm app-level limiter remains disabled or is configured as a secondary defense, not the only multi-instance control.
5. Confirm `/auth/config-check` reports `public_beta_shared_gate_satisfied=true` without echoing provider names or secret-like values.
6. Record limiter provider, configured limits, test request IDs, commit SHA, and rollback/disable path in the release notes.

## Implementation sequence

1. Add request id middleware. [done]
2. Add safe structured logging with request id, route, status, and duration. [done]
3. Add limiter abstraction with in-memory local backend first. [done]
4. Add rate-limited response tests. [done]
5. Add shared storage/gateway enforcement runbook. [done]
6. Add non-secret audit coverage for current public-abuse-sensitive routes, including snapshot create/update/delete/restore/topology-archive. [done]
7. Add non-secret `/auth/config-check` shared limiter readiness reporting. [done]
8. Replace process-local storage with shared storage/gateway enforcement for multi-instance hosting.
9. Add public beta runbook section for reviewing audit events.

## No-go criteria

Public beta remains blocked if:

- Copilot or export routes have no abuse control.
- Audit events can include secret values.
- Rate limit failures return stack traces or raw internal errors.
- There is no way to correlate a public incident with request id and workspace id.
