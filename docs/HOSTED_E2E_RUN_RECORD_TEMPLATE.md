# Hosted E2E Run Record Template

Use this record for every approved private hosted smoke. Do not use it to approve public exposure by itself.

## Run identity

| Field | Value |
| --- | --- |
| Date/time |  |
| Operator |  |
| Commit SHA |  |
| Environment label | private-preview / staging / other |
| Frontend base URL | redacted or private label |
| API base URL | redacted or private label |
| Network boundary | VPN / Tailscale / allowlist / other private control |

## Pre-run gates

| Gate | Result | Evidence |
| --- | --- | --- |
| Gun approved this private target |  |  |
| No public DNS/open exposure |  |  |
| `AZVISION_ENV=production` |  |  |
| `AZVISION_DEBUG=false` |  |  |
| Host/CORS concrete, no wildcard |  |  |
| Demo/mock workspace available |  |  |
| No real Azure write/remediation path used |  |  |
| Secrets backend-only |  |  |
| Shared limiter or approved single-process private preview control documented |  |  |
| Rollback/private route disable path known |  |  |

## Commands

```bash
node scripts/hosted_public_beta_smoke.mjs --contract-check
AZVISION_HOSTED_BASE_URL="<private-url>" \
AZVISION_HOSTED_API_BASE_URL="<private-api-url>" \
node scripts/hosted_public_beta_smoke.mjs
```

## Results

| Check | Result | Notes |
| --- | --- | --- |
| Frontend loads |  |  |
| `/healthz` |  |  |
| `/readyz` |  |  |
| API health |  |  |
| Workspace discovery |  |  |
| Demo topology nodes/edges |  |  |
| Snapshot create/list/detail/restore/delete cleanup |  |  |
| Cost unknown/estimated/mock label |  |  |
| Copilot fallback |  |  |
| Secret-like output scan |  |  |
| Security headers / `X-Request-ID` |  |  |

## Failure handling

- If snapshot cleanup fails, record snapshot id and disable the private target until cleanup is verified.
- If secret-like output appears, stop immediately, rotate affected credentials if real exposure is possible, and do not rerun until fixed.
- If rate limiting or headers are missing, treat as a public beta blocker.

## Final verdict

- Hosted private smoke result: PASS / FAIL
- Public exposure approved by this run: **No**
- Follow-up needed:
