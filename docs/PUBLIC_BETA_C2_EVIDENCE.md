# Public Beta C2 Evidence Register

This register summarizes AzVision C2 public beta readiness evidence from the 2026-06-08 long-work-window campaign (window `lww-…-12h-c2`, 5h, 18:19–23:19 PDT). C2 continues the safe-lane work started in C1 and does not approve any hosted target, shared limiter provider, OIDC/account lifecycle target values, deployment, or public exposure.

## Approval boundary

- Approved for this campaign: commits created and validated during the C2 window may be pushed to `origin/main`.
- Required after push: GitHub CI success confirmation for every push.
- Not approved here: force push, tag, release, deploy, public exposure, Azure write/remediation, OpenClaw gateway/config/update/restart, destructive cleanup, credential or secret handling.

## Validated commits

| Commit | Area | Local validation | GitHub CI |
| --- | --- | --- | --- |
| `6e26afa` | Account lifecycle readiness surface (disabled-by-default) | Frontend semantics/build and contract smoke | `27178003847` success |
| `357d2c5` | Account lifecycle API helpers (non-secret) | Backend targeted/full tests and contract smoke | `27178251733` success |
| `1af53a0` | Harden account lifecycle readiness semantics (WARN addressed) | Backend targeted/full tests and contract smoke | `27178445983` success |
| `59d88a6` | C2 account lifecycle evidence doc | Public beta contract smoke | `27178521823` success |
| `3cc7b7c` | Tighten shared limiter readiness gate | Backend targeted/full tests and contract smoke | `27178593101` success |
| `d0444d0` | Cover rate limit route groups | `tests/test_rate_limit_middleware.py`, full backend tests, contract smoke | `27178673853` success |
| `3187ff4` | Require hosted run record template presence | `tests/test_hosted_run_record_template.py`, full backend tests, contract smoke | `27178732631` success |

## Sub-agent review trail

- Reviewer: `subagent-review` (read-only).
- Scope: public-beta-safe boundary of `6e26afa` and `357d2c5`.
- Verdict: PASS on leakage/boundary; WARN on exposure aggregate semantics, `unknown=pending` frontend behavior, i18n parity, backend inverse tests, and decision template.
- Resolution: WARN addressed in `1af53a0` (aggregate renamed to `public_routes_exposure_gated`, frontend `unknown` mapped to `pending`, i18n keys added in both locales, backend inverse tests added, decision template `docs/ACCOUNT_LIFECYCLE_DECISION_TEMPLATE.md` added).

## Final C2 validation snapshot

- Working tree clean at `3187ff4`.
- Repository state: `main...origin/main` clean.
- Local validation: backend tests `506 passed` (or current head count), frontend semantics smoke PASS, frontend production build PASS, public beta contract smoke PASS.
- Last push: `3187ff4` at 2026-06-09 01:51 UTC; GitHub CI run `27178732631` (Frontend build, Backend smoke) success.

## Current gate state after C2

- G1 auth/account/workspace isolation: provider-agnostic, disabled-by-default account lifecycle contracts and UX surface are in CI-backed state. Still partial until provider-specific target values are approved.
- G3 API protection/audit trail: shared limiter readiness gate, route-group test contract, and hosted run record template presence are enforced. Still partial until a real shared limiter provider is configured and `429` evidence is captured.
- G9 docs/changelog: blocker status, approval gate, changelog, quick start, C1 evidence register, and this C2 evidence register exist; contract smoke keeps them present.

## C3 handoff criteria

C3 may start from this C2 evidence register and the unchanged C1 register. Re-opening already validated slices is only allowed if CI or tests regress.

Safe same-goal work that can continue without extra approval:

1. G1: tighten disabled-by-default account lifecycle route authorization and add inverse coverage without entering provider-specific values.
2. G3: keep shared limiter readiness gate, route-group contract, and hosted run record template presence enforced; expand parity between `docs/SHARED_LIMITER_EVIDENCE_TEMPLATE.md` and `tests/test_rate_limit_middleware.py` only as far as no-provider scaffolding allows.
3. G5: keep hosted smoke run-record contract scaffolding local-only; do not contact a hosted target.
4. G9: keep blocker status, approval gate, changelog, quick start, C1 evidence register, and this C2 evidence register synchronized; add C3 evidence register when C3 starts.

Approval-dependent work that must remain gated:

1. Selecting or entering real OIDC issuer/audience/JWKS/workspace-map values.
2. Configuring or testing a real edge/gateway/shared-store limiter provider.
3. Running hosted smoke against any private or public target.
4. Public exposure, deploy, release/tag, Azure write/remediation, OpenClaw runtime changes, credential/secret handling.
