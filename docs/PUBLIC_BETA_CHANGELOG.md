# Public Beta Changelog

This changelog tracks user-facing public beta readiness changes. It is not a release approval record.

## 2026-06-08 (continued)

### Added

- Public beta audit coverage for abuse-sensitive routes.
  - Copilot chat requests now record non-secret provider/model/prompt length metadata.
  - Scan starts now record non-secret limits and a stable subscription hash instead of raw subscription ID.
  - Manual topology node/edge create/update/delete paths now record references and changed field names only.
  - Simulation create/delete paths now record simulation IDs and safe summary metadata only.
- Public beta contract smoke now greps for the audit event types so accidental removal fails CI.

### Validation target

- Backend route audit tests must confirm request ID, account ID, workspace ID, and no raw prompt/name/secret-bearing values in audit metadata.

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
