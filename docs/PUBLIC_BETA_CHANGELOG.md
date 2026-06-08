# Public Beta Changelog

This changelog tracks user-facing public beta readiness changes. It is not a release approval record.

## 2026-06-08 (continued 3)

### Added

- Demo onboarding frontend wiring now calls the backend demo route contract.
  - The app shell imports `getDemoWorkspaceStatus()` for the global readiness row.
  - The demo CTA calls `bootstrapDemoWorkspace()` before routing users to Topology View.
  - A demo readiness badge exposes a small `ready` / `pending` signal without showing secrets or provider values.
  - The public beta onboarding card is isolated in `PublicBetaOnboarding` so future checklist work can stay focused.

### Validation target

- App-shell semantics smoke must assert the demo status helper, idempotent bootstrap CTA, and badge CSS hooks.

## 2026-06-08 (continued 2)

### Changed

- Public beta onboarding card now has a conditional first-run variant.
  - First-run mode is derived from empty workspace count plus empty topology freshness.
  - The card exposes `data-first-run` for lightweight UI and browserless assertions.
  - First-run visual emphasis respects reduced-motion preference.

### Validation target

- Frontend app-shell semantics smoke must assert first-run state derivation, `data-first-run`, conditional copy, and first-run CSS hooks.

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
