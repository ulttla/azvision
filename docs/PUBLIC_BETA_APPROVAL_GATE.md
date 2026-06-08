# Public Beta Approval Gate

This gate is the final approval checklist before AzVision can move from private validation to any public beta exposure. Passing this checklist does not itself perform or approve a deploy.

## Required approvals

| Area | Required decision | Status |
| --- | --- | --- |
| Public exposure | Gun explicitly approves the exposure target, timing, and rollback path | pending |
| Hosted target | Private smoke target has a completed run record | pending |
| Identity provider | OIDC issuer, audience, JWKS URL, and workspace map source are selected | pending |
| Account lifecycle | Invite, disable, role change, and support procedure are defined | pending |
| Shared limiter | Edge/gateway or shared-store limiter provider is selected and verified | pending |
| Data retention | Backup, restore, and disable-public-access process is ready | pending |
| Incident response | Request-id based log review path is known | pending |

## Must-pass technical gates

| Gate | Evidence |
| --- | --- |
| GitHub CI green at release commit | CI run URL and commit SHA; C1 campaign evidence is summarized in `docs/PUBLIC_BETA_C1_EVIDENCE.md` |
| Backend pytest runs in CI | CI backend job includes `python -m pytest tests -q` |
| Public beta contract smoke passes | `scripts/public_beta_contract_smoke.sh` output |
| Hosted smoke passes on private target | Completed `docs/HOSTED_E2E_RUN_RECORD_TEMPLATE.md` record |
| Rate limit behavior verified | Shared limiter provider, limits, `429`, and request ids recorded |
| OIDC login fails closed | Missing/invalid provider config cannot create a session |
| OIDC session audit is non-secret | Success/failure events contain no raw token or credential material |
| Security headers present | `X-Request-ID`, CSP, frame, referrer, and content-type headers verified |
| Secret scan clean | Hosted smoke output has no secret-like values |

## No-go conditions

Public beta exposure must not proceed if any item is true:

- Shared limiter is only process-local while multiple workers or public traffic are expected.
- Hosted smoke has not run against the exact private target intended for promotion.
- `AZVISION_ALLOWED_HOSTS` or `AZVISION_CORS_ORIGINS` contains wildcard values for public traffic.
- `AZVISION_DEBUG=true` on the hosted target.
- OIDC workspace mapping or account disable procedure is not defined.
- Any smoke output contains provider keys, tokens, passwords, certificate text, or stack traces.
- There is no documented rollback or disable-public-access path.

## Release note fields

Record these before any approved exposure:

```text
commit_sha:
ci_run:
hosted_smoke_record:
limiter_provider:
limiter_test_request_ids:
oidc_provider_label:
rollback_path:
approver:
approval_time:
```

## Current recommendation

Continue private validation only. C1 added CI-backed auth, audit, limiter-readiness, demo-onboarding, hosted-smoke evidence-output, and evidence-register scaffolding. Public exposure remains blocked until the hosted private target, shared limiter provider, OIDC/account lifecycle target values, and rollback path are explicitly selected and verified.
