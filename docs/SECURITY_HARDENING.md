# Security Hardening Baseline

This document captures the minimum security baseline for moving AzVision from personal-use into public beta planning.

## Current baseline

Implemented now:

- `AZVISION_DEBUG=false` is the safe default.
- 5xx error details are hidden when debug is disabled.
- Security headers include:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: no-referrer`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
  - `Content-Security-Policy` with self-only default and no frame ancestors
  - `Strict-Transport-Security` when debug is disabled
  - `X-XSS-Protection: 0`
- Trusted host middleware is enabled when allowed hosts are not wildcard.
- CORS origins are explicit by default for local dev ports.

## Public beta blockers

| Gap | Why it matters | Target |
| --- | --- | --- |
| Login/session model | User data cannot be separated safely | Account and session lifecycle |
| Workspace isolation | Local workspace is not a security boundary | Per-user workspace membership tests |
| Rate limiting | Public endpoints can be abused | IP and account-aware limiter |
| Audit trail | Security events are not reviewable | Auth, credential, export, snapshot events |
| Structured request logging | Incidents are hard to investigate | Request IDs and safe metadata |
| Secret handling policy | Provider/Azure secrets must stay backend-only | Secret redaction tests and runbook |

## Rate-limit design target

Detailed contract: `docs/RATE_LIMIT_AUDIT_PLAN.md`.


Initial public beta limiter should cover:

- Global unauthenticated request limit.
- Login/session endpoints once auth exists.
- Copilot chat endpoints by workspace/account.
- Export endpoints by workspace/account.
- Clear 429 response contract.

The limiter should avoid storing secret values or full prompts in logs.

## Audit event target

Minimum audit event types:

- Login success/failure.
- Workspace created/deleted.
- Credential profile created/updated/deleted.
- Snapshot deleted or restored.
- Export generated.
- Copilot provider changed.

Each event should include safe metadata only: timestamp, event type, account id, workspace id, request id, and outcome.

## Hosted configuration rules

For hosted environments:

- Set `AZVISION_ENV=production`.
- Keep `AZVISION_DEBUG=false`.
- Replace wildcard allowed hosts with concrete hostnames.
- Set CORS origins to exact frontend origins.
- Store Azure and provider credentials in backend-only secret storage.
- Do not expose backend admin or database paths publicly.

## Validation

Recommended gates before public beta:

```bash
cd /Users/gun/dev/azvision
cd backend && .venv/bin/python -m pytest -q
npm --prefix frontend run build
npm --prefix frontend run smoke:semantics
scripts/copilot_provider_smoke.sh
```

Add targeted tests for any new auth, rate-limit, audit, deployment profile, or public beta contract changes.
