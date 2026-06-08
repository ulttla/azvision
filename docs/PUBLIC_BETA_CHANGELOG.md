# Public Beta Changelog

This changelog tracks user-facing public beta readiness changes. It is not a release approval record.

## 2026-06-08

### Added

- App shell public beta readiness card.
  - Clarifies that current flow is private validation only.
  - Provides a first-run demo path CTA that opens Topology View.
  - Provides a readiness refresh CTA that rechecks backend, auth, and topology freshness.
- Public beta quick start guide at `docs/PUBLIC_BETA_QUICK_START.md`.
  - Documents demo-safe first-run flow.
  - Keeps deploy, public exposure, provider secrets, and rollback approval separate.

### Validation target

- Browserless app-shell semantics smoke must verify the onboarding card, first-run CTA, readiness refresh CTA, and CSS hooks.
- Public beta contract smoke must include the quick start and changelog docs.

### Still pending

- Real private hosted target approval and smoke run record.
- Shared limiter provider selection and `429` evidence.
- Provider-specific OIDC/account lifecycle choices.
- Public exposure, deploy, and rollback path approval.
