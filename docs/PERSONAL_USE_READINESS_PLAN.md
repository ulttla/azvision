# AzVision Personal Use Readiness Plan

Purpose: reprioritize AzVision around Gun's single-user internal use so it can be used immediately without waiting for productization.

## Target states

| Target | Status meaning | Acceptance bar |
| --- | --- | --- |
| v0.8 immediate-use | Safe to run locally for real Azure topology review | backend/frontend start, health check, live Azure read/topology smoke, manual edit path, snapshot save/restore path |
| v0.9 stable personal-use | Safe to rely on during normal personal workflow | v0.8 plus backup/restore runbook, repeatable smoke script, known limits documented, blocker-only patches validated |
| v1.0 product track | External-user/product direction | login, permission model, deployment, multi-user, stronger storage strategy, broader UX polish |

## Current decision

- Optimize this slice for **v0.9 stable personal-use**.
- Keep the product roadmap intact, but do not block personal use on productization work.
- Treat external deployment, user login, multi-user permission model, object-storage thumbnail redesign, real Azure Cost Management ingestion, deployable simulation templates, and LLM-backed copilot as deferred product-track work.

## v0.9 in scope

1. Local execution
   - one-command dev stack start path
   - health check path
   - documented URLs
2. Real data readiness
   - Azure credential/config check
   - live read-test
   - topology probe with network inference
   - network path analysis smoke on live topology resources when at least two resource nodes are available
   - Network Path Analysis UI visual smoke with screenshot evidence when frontend changes touch the path-analysis panel or filters
3. Core workflow readiness
   - topology view usable baseline
   - Network Path Analysis usable baseline with conservative NSG/route evidence
   - manual node/edge create/update path
   - snapshot create/list/detail/restore path
4. Data safety
   - SQLite backup script
   - restore steps
   - backup manifest with size/hash/source path
5. Operator guidance
   - quick start
   - daily-use checklist
   - known limits
   - smoke command and fallback skip-live mode
6. Rule-based planning helpers
   - Cost Insights and Simulation remain rule-based/non-deployable first-pass helpers
   - acceptance keeps cost report/insights smokes green; simulation smoke remains a focused check because it creates a timestamped smoke simulation record until a delete/cleanup path exists

## v0.9 out of scope

- public deployment
- user login / account management
- multi-user collaboration / permissions
- object storage for thumbnails
- full historical Azure inventory archive
- real Azure Cost Management ingestion, deployable simulation templates, and LLM-backed copilot
- Azure write/remediation operations

## Acceptance checklist

Run the full acceptance wrapper from `/Users/gun/dev/azvision`.

```bash
scripts/personal_use_acceptance.sh
```

The wrapper performs the checks below:

```bash
bash scripts/check_doc_mirror.sh
bash -n scripts/run_dev.sh
bash -n scripts/check_personal_use_ready.sh
bash -n scripts/backup_sqlite.sh
bash -n scripts/verify_sqlite_backup.sh
bash -n scripts/personal_use_smoke.sh
bash -n scripts/snapshot_compare_smoke.sh
bash -n scripts/cost_report_smoke.sh
bash -n scripts/cost_insights_smoke.sh
bash -n scripts/simulation_smoke.sh
python3 -m py_compile scripts/sqlite_health_check.py
python3 -m py_compile scripts/archive_retention_dry_run.py
scripts/check_personal_use_ready.sh
cd backend && .venv/bin/python -m pytest -q
npm --prefix frontend run build
npm --prefix frontend run smoke:semantics
scripts/sqlite_health_check.py
python3 scripts/archive_retention_dry_run.py --db backend/azvision.db --workspace local-demo --dry-run
scripts/backup_sqlite.sh
scripts/verify_sqlite_backup.sh
scripts/personal_use_smoke.sh
scripts/snapshot_compare_smoke.sh
scripts/cost_report_smoke.sh
scripts/cost_insights_smoke.sh
```

With backend running, the workflow-specific checks are:

```bash
scripts/personal_use_smoke.sh
scripts/snapshot_compare_smoke.sh
scripts/cost_report_smoke.sh
scripts/cost_insights_smoke.sh
scripts/backup_sqlite.sh
scripts/verify_sqlite_backup.sh
```

The archive retention check is dry-run only. Archive pruning or DB reconciliation is not part of routine acceptance and still requires a fresh backup, candidate review, and explicit approval.

With backend and frontend running, the path-analysis visual check is:

```bash
scripts/path_analysis_visual_smoke.mjs
```

Expected result:
- `personal_use_smoke.sh` prints `PASS: AzVision personal-use smoke completed` and verifies smoke workspace cleanup
- backend tests pass
- frontend build passes
- backup manifest exists under `backups/sqlite/<timestamp>/manifest.txt`, records `integrity_check=ok`, and passes `scripts/verify_sqlite_backup.sh`
- readiness preflight reports required local prerequisites, optional local DB presence, and config booleans without printing secret values
- docs mirror check shows only expected deferred drift
- archive retention dry-run reports `dry_run=true` and summarizes candidates without deleting or reconciling archives

## Go / no-go rule

### Go for personal use
- health check passes
- Azure read-test passes or live dependency is explicitly skipped for offline work
- topology smoke returns at least one node
- network path analysis smoke passes when at least two resource nodes are available
- path-analysis visual smoke passes when the frontend panel/filter behavior changed
- manual node/edge path passes
- snapshot create/list/detail/restore path passes
- smoke-created manual/snapshot records are cleaned up
- backup script creates a manifest
- archive retention dry-run completes without mutation

### No-go until fixed
- backend cannot start
- frontend build fails on current branch
- snapshot restore path fails
- manual modeling creates unclean or unremovable records
- backup script cannot locate/copy SQLite DBs when local state exists
- live Azure errors are unexplained and not clearly an external credential/network issue

## Next development priorities after v0.9

1. Architecture View personal-use polish is now in the stable path: readiness badges, local presentation notes, card ordering, prefixed health check, clipping fix, and board scale/scroll controls are implemented and covered by frontend smoke/build plus post-change acceptance.
2. Maintain the existing PDF export smoke/tests as part of the immediate personal workflow when export behavior changes.
3. Shared app-shell readiness is now useful outside Architecture View: keep the Backend/Auth/Topology freshness signals and manual `Refresh status` action covered by browserless smoke when shell behavior changes. Keep duplicate-click/busy-state behavior intact so the local operator cannot stack repeated health checks.
4. Revisit Azure Arc / hybrid relation expansion only after the current topology/snapshot loop is comfortable.
5. Re-enter productization planning separately when external-user goals return.
