# Public Beta Quick Start

This guide is for private validation and public beta rehearsal. It does not approve deploy, public exposure, Azure write/remediation, or credential handling.

## Start path

1. Open the AzVision app shell and confirm the global readiness row.
   - Backend must be online.
   - Auth can be not configured for demo-only rehearsal, but real external login remains blocked until OIDC provider choices are approved.
   - Topology should show demo data or a fresh private validation snapshot.
2. Use the public beta readiness card in the header.
   - `Open demo path` moves first-run users to the Topology View.
   - `Refresh readiness` rechecks backend, auth, and topology freshness without changing routes.
3. Validate a demo-safe flow only.
   - Load demo or mock topology data.
   - Review topology, Architecture View, Cost Insights, Simulation, and read-only Copilot fallback.
   - Do not enter provider secrets or real Azure remediation credentials.
4. Record private hosted smoke evidence only after Gun approves the private target.
   - Use `docs/HOSTED_E2E_RUN_RECORD_TEMPLATE.md`.
   - Keep public exposure approval separate from smoke success.

## First-run user copy

Use this positioning for beta testers:

- AzVision is a read-first Azure topology and architecture workspace.
- The first beta path starts with demo-safe topology review, not live remediation.
- Cost values are rule-based or unknown unless a real cost provider is explicitly configured.
- Copilot is read-only and must not receive secrets.
- Public beta access can be disabled or rolled back if hosted smoke, limiter, OIDC, or secret hygiene gates fail.

## Do not proceed when

- The target is publicly reachable before approval.
- `AZVISION_DEBUG=true` on the hosted target.
- Host or CORS config uses wildcard values for public traffic.
- The limiter path is process-local for multi-instance or public traffic.
- OIDC provider/workspace mapping or account disable procedure is not defined.
- Smoke output contains provider keys, tokens, passwords, certificate text, or stack traces.
