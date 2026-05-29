# Rate Limit and Audit Trail Plan

This plan defines the minimum API protection layer needed before AzVision can run a public beta.

## Current state

- Security headers and safe debug defaults are in place.
- A process-local fixed-window request limiter exists behind `AZVISION_RATE_LIMIT_ENABLED=false` by default.
- There is no durable audit event model yet.
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
- `InMemoryRateLimiter` provides a process-local fixed-window limiter for auth, exports, Copilot, and default route groups.
- The limiter is disabled by default and enabled with `AZVISION_RATE_LIMIT_ENABLED=true`; production should replace or front it with shared storage/gateway enforcement before multi-instance public traffic.

## Audit trail target

Audit events should be safe, structured metadata. They should not store secrets, raw prompts, Azure credential material, certificate paths, or request bodies.

Minimum event types:

- `session.login.success`
- `session.login.failure`
- `workspace.created`
- `workspace.updated`
- `workspace.member.changed`
- `credential_profile.created`
- `credential_profile.updated`
- `credential_profile.deleted`
- `snapshot.restored`
- `snapshot.deleted`
- `export.generated`
- `copilot.provider.changed`

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

## Implementation sequence

1. Add request id middleware.
2. Add safe structured logging with request id, route, status, and duration.
3. Add limiter abstraction with in-memory local backend first. [done]
4. Add rate-limited response tests. [done]
5. Replace process-local storage with shared storage/gateway enforcement for multi-instance hosting.
6. Add public beta runbook section for reviewing audit events.

## No-go criteria

Public beta remains blocked if:

- Copilot or export routes have no abuse control.
- Audit events can include secret values.
- Rate limit failures return stack traces or raw internal errors.
- There is no way to correlate a public incident with request id and workspace id.
