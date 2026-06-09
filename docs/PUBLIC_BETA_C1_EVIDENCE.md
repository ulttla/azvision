# Public Beta C1 Evidence Register

This register summarizes AzVision C1 public beta readiness evidence from the 2026-06-08 long-work-window campaign. It is not a public launch approval.

## Approval boundary

- Approved for this campaign: commits created and validated during the campaign may be pushed to `origin/main`.
- Required after push: GitHub CI success confirmation.
- Not approved here: force push, tag, release, deploy, public exposure, Azure write/remediation, OpenClaw gateway/config/update/restart, destructive cleanup, credential or secret handling.

## Validated commits

| Commit | Area | Local validation | GitHub CI |
| --- | --- | --- | --- |
| `f3cedfd` | Public beta onboarding path | App shell semantics/build and contract smoke | `27164254563` success |
| `0122c81` | Public-abuse-sensitive audit coverage | Backend targeted/full tests and contract smoke | `27164731244` success |
| `c708789` | Conditional first-run card | Frontend semantics/build and contract smoke | `27164936574` success |
| `749d35c` | Public beta readiness gates docs | Contract smoke | `27165062895` success |
| `354bbfd` | Shared limiter evidence template | Contract smoke | `27165246723` success |
| `06d636e` | Non-secret OIDC readiness reporting | Backend targeted/full tests and contract smoke | `27165475867` success |
| `cd22a01` | Account disable/session revoke helper | Backend targeted/full tests and contract smoke | `27165636465` success |
| `46e46c4` | Hosted smoke JSON evidence output | Hosted smoke contract check and contract smoke | `27165800714` success |
| `e04cd25` | Shared limiter readiness reporting | Backend targeted/full tests and contract smoke | `27166156683` success |
| `ad41f11` | Snapshot mutation audit coverage | `tests/test_snapshots.py`, full backend tests, contract smoke | `27167049074` success |
| `2d2c87e` | Demo onboarding backend route contract | `tests/test_workspaces_route_security.py`, full backend tests, contract smoke | `27168570713` success |
| `12fc1c3` | Demo onboarding frontend/API wiring | Frontend semantics/build and contract smoke | `27170127008` success |
| `6f4befa` | Public beta onboarding card extraction | Frontend semantics/build and contract smoke | `27170236617` success |
| `92f3956` | Disabled-by-default account management route contract | Auth/session targeted tests, full backend tests, contract smoke | `27170387338` success |
| `88f7053` | C1 evidence register | Public beta contract smoke | `27171391798` success |
| `dc1d558` | Approval gate refresh | Public beta contract smoke | `27171463166` success |
| `1a7725b` | C1 to C2 handoff criteria | Public beta contract smoke | `27172659316` success |
| `e156364` | C1 evidence links for exposure proof templates | Public beta contract smoke | `27173858157` success |
| `b492b0b` | C2 safe/gated work split | Public beta contract smoke | `27175032573` success |

## Final validation snapshot

Final C1 local validation on 2026-06-09 UTC was recorded into this register and then re-validated at the documentation head:

- Local validation baseline: backend tests `506 passed`, frontend semantics smoke PASS, frontend production build PASS, public beta contract smoke PASS, repository state `main...origin/main` clean.
- Local validation source baseline: `b492b0b`, GitHub CI run `27175032573`, success.
- Final evidence-register head: `d9d5314`, GitHub CI run `27176255081`, success.

This validates the C1 evidence baseline only. It does not approve private hosted smoke execution, shared limiter provider configuration, deployment, public exposure, Azure write/remediation, release/tag, credential/secret handling, or OpenClaw runtime changes.

## Current gate state

- G1 auth/account/workspace isolation: improved, still partial until provider-specific target values and broader lifecycle UX/route authorization are approved.
- G3 API protection/audit trail: improved, still partial until real shared limiter provider enforcement evidence exists.
- G4 onboarding/demo path: backend route contract, frontend CTA wiring, and component extraction are in CI-backed state.
- G9 docs/changelog: quick start, changelog, blocker status, and this evidence register exist.

## C2 handoff criteria

C2 should start from this evidence register and avoid reopening already validated C1 slices unless CI or tests regress.

Safe same-goal work that can continue without extra approval:

1. G1: document provider-specific OIDC/account lifecycle decisions as placeholders or add disabled-by-default route contracts that keep public exposure blocked.
2. G3: improve provider-agnostic shared limiter docs, readiness reporting, and evidence templates without configuring a real provider.
3. G5: prepare hosted smoke run-record structure and local contract checks without contacting a hosted target.
4. G9: keep blocker status, approval gate, changelog, quick start, and evidence register synchronized.

Approval-dependent work that must remain gated:

1. Selecting or entering real OIDC issuer/audience/JWKS/workspace-map values.
2. Configuring or testing a real edge/gateway/shared-store limiter provider.
3. Running hosted smoke against any private or public target.
4. Deploy, public exposure, release/tag, Azure write/remediation, credential/secret handling, destructive cleanup, or OpenClaw runtime changes.

## Remaining approval-dependent evidence

- Private hosted smoke run against an approved private target.
- Shared limiter provider trigger evidence and rollback/disable path.
- Provider-specific OIDC/account lifecycle target values.
- Any deploy, public exposure, release, or Azure write action.
