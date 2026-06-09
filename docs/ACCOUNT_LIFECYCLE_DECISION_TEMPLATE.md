# Account Lifecycle Decision Template

This template records the non-secret operator decisions required before AzVision can move from private validation to any public beta exposure. It is intentionally value-free: do not paste provider secrets, raw tokens, private hosted URLs, tenant-specific IDs, or user emails here.

## Public exposure status

- Public exposure approved by this template: **No**
- Deploy approved by this template: **No**
- Provider secrets approved by this template: **No**
- Azure write or remediation approved by this template: **No**

## Required decisions

| Decision | Allowed placeholder | Required evidence before exposure |
| --- | --- | --- |
| Identity provider lane | `oidc-provider-selected` | Issuer, audience, and JWKS configured outside docs; `/auth/config-check` shows only presence booleans and valid workspace map counts. |
| Account invite path | `manual-allowlist`, `operator-created`, or `future-admin-ui` | Non-secret runbook names who can invite, what role can be granted, and how identity proof is checked. |
| Disable account path | `self-disable-only`, `operator-disable`, or `support-ticket-disable` | `/auth/account/disable` remains fail-closed until account-management is explicitly enabled; operator path documents rollback and audit review. |
| Role change path | `no-role-change`, `operator-role-change`, or `future-admin-ui` | Owner/viewer transitions require explicit audit reason and no cross-workspace leakage. |
| Session lifetime | `short-beta-session` or `provider-default-session` | Token issuance stores only hashes; logout/revocation smoke passes. |
| Emergency access stop | `disable-auth-routes`, `remove-workspace-map`, or `disable-public-target` | Rollback path tested against the private target, not production users first. |

## Fail-closed checks

Before exposure, all must be true:

1. `/auth/config-check` returns only booleans/counts for OIDC, account lifecycle, and shared limiter readiness, including `public_routes_exposure_gated` as a conservative UI aggregate only.
2. `/auth/me` rejects missing/invalid bearer tokens with `401` and never echoes the token.
3. `/auth/account/disable` returns hidden `404` until `AZVISION_AUTH_ACCOUNT_MANAGEMENT_ENABLED=true` is explicitly set.
4. Disabled accounts and revoked/expired sessions are rejected at HTTP level.
5. Account lifecycle UI copy does not claim public launch approval.
6. Shared limiter evidence is captured for public-abuse-sensitive routes.

## Non-secret evidence to attach

- CI run URL and commit SHA.
- Private hosted smoke run record path, if approved and executed.
- Shared limiter evidence record path, if approved and executed.
- Operator account lifecycle decision summary using only placeholders above.

## Current C2 status

C2 may safely add route contracts, API helpers, UI readiness scaffolding, docs, and local/CI tests. C2 must not add real provider values, hosted public exposure, deploy actions, Azure write/remediation, force push, tags, releases, gateway restart/config/update, destructive cleanup, or credential handling without a separate approval and concrete target inputs.
