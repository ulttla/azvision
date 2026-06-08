# Shared Limiter Evidence Template

Use this record before any public beta exposure. It does not approve exposure by itself.

## Scope

The in-app limiter is process-local and is acceptable only for local development or approved single-process private preview. Public beta or multi-instance traffic needs edge/gateway enforcement or shared-store enforcement.

## Run identity

| Field | Value |
| --- | --- |
| Date/time |  |
| Operator |  |
| Commit SHA |  |
| Environment label | private-preview / staging / public-beta-candidate |
| Limiter provider | edge-gateway / shared-store / approved single-process private preview |
| Disable or rollback path |  |

## Pre-run gates

| Gate | Result | Evidence |
| --- | --- | --- |
| Gun approved this private/public-beta-candidate target |  |  |
| Target boundary documented |  |  |
| App-level limiter role documented as primary or secondary |  |  |
| Shared limiter configuration is versioned or exportable |  |  |
| No secrets in limiter rules or logs |  |  |
| Rollback/disable path known |  |  |

## Minimum route groups

| Group | Expected key | Expected limit source | Test result | Request IDs |
| --- | --- | --- | --- | --- |
| `auth_oidc_session` | source IP, then account/email when available | shared limiter |  |  |
| `auth` | source IP | shared limiter |  |  |
| `exports` | account plus workspace, or edge equivalent | shared limiter |  |  |
| `copilot` | account plus workspace, or edge equivalent | shared limiter |  |  |
| `default` | source IP or account plus workspace | shared limiter |  |  |

## Required checks

1. Trigger each route group until it returns `429` or the platform-specific equivalent.
2. Confirm `Retry-After` exists, or record why the edge cannot emit it.
3. Confirm response body is either the AzVision stable envelope or a documented platform envelope.
4. Confirm request IDs are present in app logs or edge logs.
5. Confirm no prompt, token, provider key, password, certificate text, or Azure credential appears in limiter logs.
6. Confirm app workers are not the only enforcement point for public or multi-instance traffic.

## Result table

| Check | Result | Notes |
| --- | --- | --- |
| `auth_oidc_session` 429 behavior |  |  |
| `auth` 429 behavior |  |  |
| `exports` 429 behavior |  |  |
| `copilot` 429 behavior |  |  |
| `default` 429 behavior |  |  |
| Retry-After or documented edge exception |  |  |
| Request ID correlation |  |  |
| No secret-like log output |  |  |
| Rollback/disable path tested or documented |  |  |

## Final verdict

- Shared limiter evidence result: PASS / FAIL
- Public exposure approved by this run: **No**
- Follow-up needed:
