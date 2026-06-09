# Public Beta C3 Evidence Register

This register summarizes AzVision C3 public beta readiness evidence from the 2026-06-08 long-work-window campaign (window `lww-…-12h-c3`, 2h, 23:23–01:23 PDT). C3 is the final chunk of the 12h campaign, continues the safe-lane work started in C1 and continued in C2, and does not approve any hosted target, shared limiter provider, OIDC/account lifecycle target values, deployment, or public exposure.

## Approval boundary

- Approved for this campaign: commits created and validated during the C3 window may be pushed to `origin/main`.
- Required after push: GitHub CI success confirmation for every push.
- Not approved here: force push, tag, release, deploy, public exposure, Azure write/remediation, OpenClaw gateway/config/update/restart, destructive cleanup, credential or secret handling.

## Validated commits

| Commit | Area | Local validation | GitHub CI |
| --- | --- | --- | --- |
| `3ad221c` (C2 carryover) | C2 evidence register and blocker link | Contract smoke PASS (carried into C3 unchanged) | `27180735146` success |
| `<C3-commit-1>` (this window) | C3 evidence register + G9 cross-link + contract smoke guard | Public beta contract smoke (pending) | (pending) |

## Sub-agent review trail

- Reviewer: `claude-review` (or other second-lane challenger) — read-only review of the C3 material commit (`<C3-commit-1>`).
- Verdict: (recorded at closeout).
- Resolution: (recorded at closeout, with WARN-addressed notes if applicable).

## Final C3 validation snapshot

- Working tree clean at `<C3-commit-1>` (or final C3 commit hash).
- Repository state: `main...origin/main` clean.
- Local validation: public beta contract smoke PASS (with C3 evidence register registered in required-docs list).
- Last push: `<C3-commit-1>` at (timestamp); GitHub CI run (id) (Frontend build, Backend smoke) success.

## Current gate state after C3

- G1 auth/account/workspace isolation: still provider-agnostic, disabled-by-default account lifecycle contracts and UX surface in CI-backed state. Still partial until provider-specific target values are approved.
- G3 API protection/audit trail: shared limiter readiness gate, route-group test contract, and hosted run record template presence remain enforced. Still partial until a real shared limiter provider is configured and `429` evidence is captured.
- G9 docs/changelog: blocker status, approval gate, changelog, quick start, C1 evidence register, C2 evidence register, and this C3 evidence register exist; contract smoke keeps them present.

## C3 handoff criteria (next window or campaign)

C3 closes the 12h campaign. Re-opening already validated slices is only allowed if CI or tests regress.

Safe same-goal work that can continue in a future campaign without extra approval:

1. G1: tighten disabled-by-default account lifecycle route authorization and add inverse coverage without entering provider-specific values.
2. G3: keep shared limiter readiness gate, route-group contract, and hosted run record template presence enforced; expand parity between `docs/SHARED_LIMITER_EVIDENCE_TEMPLATE.md` and `tests/test_rate_limit_middleware.py` only as far as no-provider scaffolding allows.
3. G5: keep hosted smoke run-record contract scaffolding local-only; do not contact a hosted target.
4. G9: keep blocker status, approval gate, changelog, quick start, C1/C2/C3 evidence registers synchronized; add future evidence registers per chunk.

Approval-dependent work that must remain gated:

1. Selecting or entering real OIDC issuer/audience/JWKS/workspace-map values.
2. Configuring or testing a real edge/gateway/shared-store limiter provider.
3. Running hosted smoke against any private or public target.
4. Public exposure, deploy, release/tag, Azure write/remediation, OpenClaw runtime changes, credential/secret handling.
