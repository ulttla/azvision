# Hosted E2E Preflight Plan

AzVision must not be publicly exposed until a hosted browser smoke exists for the public beta entry path. This plan defines that smoke without approving a deploy.

## Scope

The hosted E2E preflight validates a private production-like environment before any public beta exposure.

It must cover:

1. frontend loads through the production static serving path
2. backend `/healthz` and `/readyz` are reachable through the public route boundary
3. demo workspace loads without Azure credentials
4. topology graph can load demo data
5. snapshot create/list/detail/restore path works on demo data
6. path analysis page shows known/unknown wording safely
7. cost page labels cost data as unknown or estimated unless real provider is configured
8. Copilot fallback answers without external provider credentials
9. security headers and `X-Request-ID` are visible on API responses
10. no secret-like values appear in visible page text or API responses used by the smoke

## Required environment

| Item | Requirement |
| --- | --- |
| Frontend | production build served by static server or reverse proxy |
| Backend | `AZVISION_ENV=production`, `AZVISION_DEBUG=false` |
| Host/CORS | explicit allowed host and frontend origin |
| Data | demo workspace or mock topology mode |
| Public access | disabled until preflight passes and Gun approves exposure |

## Smoke command target

Future smoke command shape:

```bash
AZVISION_HOSTED_BASE_URL=https://private-preview.example \
AZVISION_HOSTED_API_BASE_URL=https://private-preview.example/api/v1 \
node scripts/hosted_public_beta_smoke.mjs
```

The smoke should fail closed if either URL is missing.

## Assertions

| Area | Assertion |
| --- | --- |
| Shell | page title/header visible |
| Health | `/healthz` and `/readyz` return ok/degraded as expected for private profile |
| Headers | `X-Request-ID`, `Content-Security-Policy`, and no debug stack trace |
| Demo data | demo topology has nodes and edges |
| Snapshot | create/list/detail/restore completes and cleans up if possible |
| Cost | unknown or estimated cost label visible |
| Copilot | rule-based fallback answer works without secrets |
| Security | no provider key, Azure secret, token, password, or certificate text in smoke output |

## No-go

- No public DNS or open internet exposure from this plan alone.
- No real Azure write/remediation.
- No credential entry in automated browser smoke.
- No smoke that requires storing secrets in frontend code.
- No launch if login/workspace isolation remains absent for external users.

## Relationship to production profile

`docker-compose.production.example.yml` and `scripts/production_profile_smoke.sh` are file/profile checks. The hosted E2E preflight is the next layer: it validates the running private environment through a browser/API boundary.

## Local contract check

The script can be checked without network access:

```bash
node scripts/hosted_public_beta_smoke.mjs --contract-check
```

Normal execution still fails closed unless `AZVISION_HOSTED_BASE_URL` and `AZVISION_HOSTED_API_BASE_URL` are provided.

## CI coverage

GitHub CI runs the hosted E2E preflight contract smoke as a contract check only. It does not contact a hosted environment or approve public exposure.
