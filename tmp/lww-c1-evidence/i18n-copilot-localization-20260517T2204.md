# AzVision C1 i18n/Copilot localization evidence — 2026-05-17 22:04 PDT

Scope: local-only v0.95 i18n foundation, ko/en toggle, Copilot stability, smoke/docs.

## Completed local commits in this slice

- `5e69613` — Korean language toggle foundation and app shell/cost/copilot dictionary coverage.
- `5b78e1e` — TopologyPage headings, controls, and detail labels.
- `12dbfa0` — Topology drilldown/form label cleanup from review findings.
- `274d8d3` — ArchitecturePage and SimulationPage major shell labels, buttons, and empty states.
- `06ee20a` — Architecture/Simulation fallback, export, scope, shared, resource-count, and aria strings localized; unused `sim.status.covered` removed.
- `2b6a6e6` — Copilot forwards current UI locale to backend context and LLM prompt language instruction.

## Validation evidence

- `npm --prefix frontend run smoke:semantics` — PASS after i18n/Copilot locale changes.
- `npm --prefix frontend run build` — PASS after i18n/Copilot locale changes.
- `backend/.venv/bin/python -m pytest backend/tests/test_copilot.py -q` — PASS, 21 tests.

## Guardrails

- No git push.
- No GitHub Actions.
- No Azure write/remediation.
- No destructive cleanup/prune/reconcile.
- No OpenClaw gateway/config/update/restart.
