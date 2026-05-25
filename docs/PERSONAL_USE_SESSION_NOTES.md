# AzVision Personal Use Session Notes

This file captures short, operator-facing notes for the personal-use readiness baseline. It is not a product roadmap.

## Current personal-use verdict

- **v0.9 status:** usable for Gun single-user local/dev workflows after running acceptance.
- **Primary command:** `scripts/personal_use_acceptance.sh`
- **Daily start:** `scripts/run_dev.sh`
- **Daily smoke:** `scripts/personal_use_smoke.sh`
- **Snapshot compare smoke:** `scripts/snapshot_compare_smoke.sh`
- **Cost smoke:** `scripts/cost_report_smoke.sh` and `scripts/cost_insights_smoke.sh`
- **Simulation smoke:** `scripts/simulation_smoke.sh` (focused; creates then deletes a timestamped smoke simulation record)
- **SQLite health:** `scripts/sqlite_health_check.py`
- **Archive retention dry-run:** `python3 scripts/archive_retention_dry_run.py --db backend/azvision.db --workspace local-demo --dry-run`
- **Data safety:** `scripts/backup_sqlite.sh` followed by `scripts/verify_sqlite_backup.sh`

## What was validated

- backend health endpoint
- frontend dev server root response
- Azure config/read-test
- live topology projection with network inference
- Network Path Analysis endpoint smoke on live topology resources when available
- manual node/edge create-update-cleanup path
- snapshot create/list/detail/restore-cleanup path
- metadata-level snapshot compare path
- backend full test suite
- frontend production build
- SQLite backup with SHA-256 and `integrity_check=ok`
- SQLite backup verifier
- SQLite health signal for snapshots, thumbnails, manual records, simulations, and topology archive warnings
- dry-run-only archive retention candidate summary
- rule-based cost report and scoped cost insights smoke
- read-only Copilot provider list, provider health signal, chat fallback, and no-secret contract smoke
- shared Copilot panel wiring for Cost, Topology, Architecture, and Simulation views through browserless semantics smoke
- OpenRouter provider error fallback coverage for auth/rate-limit/gateway/non-JSON/empty-choice paths, with no-secret assertions
- OpenRouter optional app attribution header coverage for chat and health-probe requests, keeping API key/token values backend-only
- opt-in OpenRouter provider smoke invocation via `AZVISION_COPILOT_SMOKE_PROVIDER=openrouter`, preserving no-secret fallback expectations
- browserless semantics guard for opt-in live Copilot UI smoke skip/provider/secret-marker behavior
- opt-in live Copilot UI smoke skip path exits before Playwright loading when not enabled
- personal-use acceptance now exercises the disabled opt-in live Copilot UI smoke skip path
- non-Cost Copilot view context redaction coverage for Topology and Simulation secret-like fields
- rule-based simulation create/list/detail/template/report/fit smoke, run as a focused check with cleanup through the simulation delete endpoint
- run script start and stop cleanup behavior
- app-shell topology freshness polling clears stale node count when no workspace is available
- Topology PDF export smoke now guards localized image preparation failure handling

## Current Copilot acceptance boundary

2026-05-23/24 Copilot smoke hardening is now included in `origin/main` through baseline `0adb88b`. Treat these commits as pushed validation evidence, not local-only work:

- `05e952a` — shared Copilot panel wiring semantics for Cost, Topology, Architecture, and Simulation.
- `ec3d00d` — OpenRouter provider fallback/no-secret backend tests for auth, rate-limit, gateway, non-JSON, empty-choice, and secret-adjacent error responses.
- `a051b98` — opt-in hosted provider smoke selector via `AZVISION_COPILOT_SMOKE_PROVIDER`.
- `fceb2a7` — browserless guard that `copilot_live_ui_smoke.mjs` stays opt-in, skips safely by default, supports provider env override, and checks obvious secret markers.
- `8385228` — personal-use acceptance exercises the disabled live Copilot UI skip path.
- `2eea0ed` — `frontend smoke:semantics` enrollment guard keeps the app-shell semantics smoke in the default browserless bundle.
- `0adb88b` — documents the live Copilot acceptance skip contract and operator opt-in boundary.

Safe focused gates for this boundary:

```bash
node --experimental-strip-types scripts/copilot_api_semantics_smoke.mts
backend/.venv/bin/python -m pytest backend/tests/test_copilot.py -q
bash -n scripts/copilot_provider_smoke.sh
bash scripts/check_doc_mirror.sh
```

Do not run hosted provider or live UI paths as routine acceptance unless the operator intentionally opts in and backend provider env is configured. Do not deploy or perform Azure write/remediation without fresh approval.

## 2026-05-24 productization hardening evidence

After personal-use acceptance passed, C1 continued into no-deploy production-readiness hardening. The following pushed commits are included in `origin/main` and all corresponding GitHub CI runs passed:

- `88c9a80` — adds configurable production host validation (`AZVISION_ALLOWED_HOSTS`) and baseline API security headers.
- `103552b` — keeps `/auth/config-check` local path diagnostics behind debug mode so production does not expose env file paths.
- `e16f06d` — hides unexpected 500/internal error details when debug is off while preserving debug/dev detail.
- `fe3583d` — adds `/readyz` and `/api/v1/readyz` database-readiness endpoints with no DB path leakage.
- `62c247f` — enrolls `/readyz` in CI startup smoke, `personal_use_smoke.sh`, backend API semantics smoke, and docs.
- `1a8ab10` — records the pushed productization-hardening evidence and safe focused gates.
- `459467b` — makes `scripts/run_dev.sh` wait for both `/healthz` and `/readyz` before declaring the backend ready, and updates recovery-runbook minimum checks.

Safe focused gates for this hardening line:

```bash
backend/.venv/bin/python -m pytest backend/tests/test_security_headers.py backend/tests/test_auth.py backend/tests/test_response_utils.py -q
npm --prefix frontend run smoke:semantics
scripts/personal_use_smoke.sh
bash scripts/check_doc_mirror.sh
```

These are productization-hardening steps only. They do not imply hosted deployment, Azure write/remediation, multi-user auth, or destructive cleanup approval.

## Recent UI i18n validation evidence

2026-05-19 local validation refreshed the UI i18n/readiness evidence after the post-push C1 continuation work:

- Topology search group/scope labels, topology export/raw-diff labels, Architecture stage labels, Architecture inline labels, and Architecture SVG export labels were moved onto the existing en/ko dictionary path.
- After each slice, `npm --prefix frontend run smoke:semantics` and `npm --prefix frontend run build` passed.
- Evidence batch commits `c17a60f`, `38579f0`, `c8c220a`, `3118743`, `6c01c71`, and `e990e71` are now included in `origin/main`.

## When to run acceptance

Run full acceptance:

```bash
cd /Users/gun/dev/azvision
scripts/personal_use_acceptance.sh
```

Use it:
- before relying on the app after a code change
- after dependency/environment changes
- after restoring SQLite state
- before declaring the personal-use baseline healthy

Run focused smokes separately when changing related behavior:

```bash
cd /Users/gun/dev/azvision
scripts/snapshot_compare_smoke.sh
scripts/cost_report_smoke.sh
scripts/cost_insights_smoke.sh
scripts/copilot_provider_smoke.sh
node --experimental-strip-types scripts/copilot_answer_parser_smoke.mts
node --experimental-strip-types scripts/copilot_api_semantics_smoke.mts
node scripts/copilot_empty_answer_ui_smoke.mjs  # opt-in local UI gate; requires the Vite dev server
AZVISION_LIVE_COPILOT_SMOKE=1 node scripts/copilot_live_ui_smoke.mjs  # opt-in live LLM UI gate
scripts/simulation_smoke.sh  # focused check; creates then deletes a timestamped smoke simulation record
scripts/sqlite_health_check.py
python3 scripts/archive_retention_dry_run.py --db backend/azvision.db --workspace local-demo --dry-run
```

## Known non-blocking limits

- This remains local/dev single-user use, not external product deployment.
- Snapshot stores view state and metadata; raw topology archives are stored separately when topology archive paths are invoked.
- Snapshot compare UI is metadata-first and also surfaces bounded raw topology diff details/markdown export when archives are available. Real archive prune/delete remains approval-gated; routine acceptance only runs dry-run candidate review.
- Network Path Analysis is conservative: missing/ambiguous NSG or route data remains `unknown` rather than assumed allowed.
- Thumbnail preview is optional and may be removed by guard checks.
- `scripts/run_dev.sh` uses `backend/azvision.db` with the current relative SQLite URL. A root-level `azvision.db` exists as known legacy state; current health checks show it has no snapshots/manual records/simulations and only historical orphan topology archive rows. It is backed up for safety, but should not be moved or reconciled without explicit approval.
- Azure live smoke depends on local credentials, certificate path, and network access.
- Simulation smoke now deletes its own timestamped record through the simulation cleanup endpoint; still avoid running it as a tight loop because it exercises the live backend workflow.
- Productization items remain deferred: login, multi-user permissions, object storage thumbnails, real Azure Cost Management ingestion, deployable simulation templates, product-grade Copilot features such as streaming/persistent chat history, hosted deployment polish, and any Azure write/remediation behavior.

## If something fails

1. Run `scripts/check_personal_use_ready.sh`.
2. If backend fails, inspect `.env`, certificate path, and `backend/.venv`.
3. If live Azure smoke fails, run `scripts/live_topology_probe.sh` to separate credential/network issues from app issues.
4. If backup fails, do not delete local DBs; rerun `scripts/backup_sqlite.sh` and `scripts/verify_sqlite_backup.sh`.
5. If `sqlite_health_check.py` reports orphan archives, treat it as an action signal only; run the retention dry-run and request explicit approval before any cleanup.
6. If workflow smoke leaves records behind, rerun with a fresh `AZVISION_SMOKE_WORKSPACE_ID` and inspect manual/snapshot/simulation list endpoints for the old smoke workspace.

- 2026-05-23/24 C2 result: from pushed baseline `8385228`, added an explicit app-shell smoke enrollment guard (`2eea0ed`) so `frontend smoke:semantics` continues to run `app_shell_semantics_smoke.mts`, then documented the live Copilot acceptance skip contract (`0adb88b`). Both commits are included in `origin/main`.

## 2026-05-24 C2 no-deploy hardening evidence

C2 continued the same post-acceptance productization-hardening line without deploy, Azure write/remediation, force push, gateway/config/update, destructive cleanup, or credential handling. The following pushed commits are included in `origin/main`; GitHub CI is green through `b0570b2` / run `26365832916`:

- `ab39a09` — requires both `/healthz` and `/readyz` before `scripts/personal_use_acceptance.sh` treats a temporary backend as ready.
- `f4d625e` — honors the documented `AZVISION_ENV` alias, plus `AZVISION_ENVIRONMENT`, for environment selection.
- `f3e75bf` — asserts security headers on degraded `/readyz` responses.
- `06c9745` — covers root and API-prefixed health/readiness endpoints at TestClient level.
- `ea12152` — protects Copilot provider health-smoke output from OpenRouter secret/API-key/Bearer leakage.
- `b0570b2` — makes the app shell backend connectivity signal require both liveness and database readiness.

2026-05-25 C1 continuation from baseline `5173b79` added optional OpenRouter backend-only app attribution headers (`OPENROUTER_HTTP_REFERER`, `OPENROUTER_APP_TITLE`) for hosted-provider chat and health probes, with focused no-secret tests and docs. The slice is pushed to `origin/main` through `701f4eb`; latest GitHub CI run `26412879258` is green. Pushed commits:

- `53b683b` — adds optional OpenRouter attribution headers on chat and health probes without returning secrets in provider/chat responses.
- `96fbf71` — covers blank/empty attribution header omission and default title behavior.
- `c0ab0f1` — sends canonical `X-OpenRouter-Title` plus legacy `X-Title` for compatibility and updates docs/tests.
- `6198ea3` — enrolls `X-OpenRouter-Title` in `copilot_api_semantics_smoke.mts`.
- `701f4eb` — records pushed attribution evidence in this session note.

Focused C2 gates used:

```bash
backend/.venv/bin/python -m pytest backend/tests/test_config.py backend/tests/test_security_headers.py -q
backend/.venv/bin/python -m pytest backend/tests/test_copilot.py -q
node --experimental-strip-types scripts/backend_api_routes_semantics_smoke.mts
node --experimental-strip-types scripts/app_shell_semantics_smoke.mts
node --experimental-strip-types scripts/copilot_api_semantics_smoke.mts
node --experimental-strip-types scripts/frontend_types_semantics_smoke.mts
npm --prefix frontend run build
bash scripts/check_doc_mirror.sh
```

Remaining approval-gated or deferred work stays unchanged: hosted deployment validation, Azure write/remediation, multi-user auth, production secret handling, and destructive cleanup.
