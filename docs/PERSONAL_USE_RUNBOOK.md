# AzVision Personal Use Runbook

Purpose: make AzVision usable as Gun's single-user local/dev app without opening external productization scope.

## Readiness target
- Target: personal-use v0.9
- In scope: local backend/frontend execution, Azure read diagnostics, topology view, manual modeling, server-backed snapshot/history, SQLite backup/restore path, quick smoke validation, rule-based Cost Insights, and focused rule-based Simulation smoke
- Out of scope: public deployment, user login, multi-user permissions, object storage thumbnails, real Azure Cost Management ingestion, deployable simulation templates, and LLM-backed copilot

## Start the app

```bash
cd /Users/gun/dev/azvision
scripts/run_dev.sh
```

Default URLs:
- API: `http://127.0.0.1:8000`
- UI: `http://127.0.0.1:5173`

Stop both processes with `Ctrl+C` in the terminal that runs `scripts/run_dev.sh`.

## Preflight / health check

Before starting the app, run the local readiness preflight:

```bash
cd /Users/gun/dev/azvision
scripts/check_personal_use_ready.sh
```

After starting the app, verify runtime health:

```bash
curl -fsS http://127.0.0.1:8000/healthz
curl -fsS http://127.0.0.1:8000/api/v1/auth/config-check
```

Expected personal-use baseline:
- `/healthz` returns `{"status":"ok"}`
- `auth/config-check` shows Azure tenant/client/certificate inputs present and certificate path exists

## Personal-use acceptance and smoke

For a full v0.9 acceptance pass, run:

```bash
cd /Users/gun/dev/azvision
scripts/personal_use_acceptance.sh
```

The acceptance wrapper syntax-checks `scripts/simulation_smoke.sh` but does not run it as a routine step. The focused simulation smoke now deletes its timestamped simulation record through the simulation cleanup endpoint after its create/list/detail/template/report/fit checks.

Run the lighter workflow smoke after starting the backend. It checks backend health, live Azure read/topology, Network Path Analysis on live topology resources when possible, manual node/edge CRUD, snapshot create/list/detail/restore, and cleanup of smoke-created records.

```bash
cd /Users/gun/dev/azvision
scripts/personal_use_smoke.sh
```

When the frontend dev server is also running, run the UI visual smoke for Network Path Analysis. It restores an available snapshot if the current canvas is empty, selects source/destination resource nodes, applies `Tcp`, `source_port=50000`, `destination_port=443`, runs analysis, and writes screenshots under `tmp/path-analysis-visual-smoke/`.

```bash
cd /Users/gun/dev/azvision
scripts/path_analysis_visual_smoke.mjs
```

Snapshot compare is available for server snapshots. In the UI, click `Set compare base` on one snapshot, then `Compare` on another snapshot. The UI compare path runs saved view-state metadata first and then shows a bounded raw topology diff card when topology archives are available. The raw diff card includes archive status, summary, expandable node/edge sections, changed-node before/after detail, and markdown export. Retention is currently health-signal/design only; automatic prune/delete is intentionally disabled. For focused API smokes with the backend running:

```bash
cd /Users/gun/dev/azvision
scripts/snapshot_compare_smoke.sh
scripts/cost_report_smoke.sh
scripts/cost_insights_smoke.sh
scripts/simulation_smoke.sh  # focused check; creates then deletes a timestamped simulation smoke record
scripts/sqlite_health_check.py
python3 scripts/archive_retention_dry_run.py --db backend/azvision.db --workspace local-demo --dry-run
python3 scripts/sqlite_health_check_selftest.py
npm --prefix frontend run smoke:semantics # includes topology_archive_smoke.mts
```

Simulation smoke note:
- `scripts/simulation_smoke.sh` creates a timestamped simulation smoke record, exercises list/detail/template/report/fit, then deletes the record through the simulation cleanup endpoint. Use it as a focused check when simulation behavior changes or before a release-quality baseline, not as a high-frequency routine loop.

Useful options:

```bash
# Use a smaller topology probe
AZVISION_RESOURCE_GROUP_LIMIT=20 AZVISION_RESOURCE_LIMIT=40 scripts/personal_use_smoke.sh

# Skip live Azure read/topology when credentials or network are unavailable
AZVISION_SKIP_LIVE=1 scripts/personal_use_smoke.sh
```

## Backup SQLite state

```bash
cd /Users/gun/dev/azvision
scripts/backup_sqlite.sh
```

Default backup target:
- `backups/sqlite/<timestamp>/`

The script copies both known local DB locations if present:
- `azvision.db`
- `backend/azvision.db`

Canonical local runtime note:
- `scripts/run_dev.sh` starts the backend from `backend/`. With the current `.env` value `AZVISION_DATABASE_URL=sqlite:///./azvision.db`, the live app resolves the database to `backend/azvision.db`.
- A root-level `azvision.db` can still exist from older/manual runs and is backed up for safety, but it is not the normal `run_dev.sh` runtime DB. Current local health checks classify the root DB as legacy state with no snapshots/manual records/simulations and historical orphan topology archive rows only. Do not move, delete, or reconcile either DB without a fresh backup and explicit approval.

Each backup writes a `manifest.txt` with byte size, SHA-256, source path, backup path, and SQLite `PRAGMA integrity_check` result. When `sqlite3` is available, the script uses SQLite's `.backup` command instead of raw file copy.

Verify the latest backup before relying on it:

```bash
cd /Users/gun/dev/azvision
scripts/verify_sqlite_backup.sh
```

You can also verify a specific backup directory:

```bash
scripts/verify_sqlite_backup.sh backups/sqlite/<timestamp>
```

## Restore SQLite state

1. Stop the backend/frontend process.
2. Pick the backup directory under `backups/sqlite/<timestamp>/`.
3. Copy the chosen DB back to its original path, for example:

```bash
cd /Users/gun/dev/azvision
cp backups/sqlite/<timestamp>/backend-azvision.db backend/azvision.db
```

4. Start the app again with `scripts/run_dev.sh`.
5. Run `scripts/personal_use_smoke.sh` or at minimum `/healthz` + snapshot list checks.

## Daily-use checklist

1. Optional preflight: `scripts/check_personal_use_ready.sh`
2. Start app: `scripts/run_dev.sh`
3. Open UI: `http://127.0.0.1:5173`
4. Confirm Azure read: `scripts/live_topology_probe.sh` or UI scope load
5. For network troubleshooting, select source/destination resource nodes and run Network Path Analysis with only the filters you need (`source_port` is usually optional). For VNet peering results, use the Peering hint as evidence context: direct peering does not require `allowForwardedTraffic`, while forwarded/transitive candidates require `allowForwardedTraffic=true` on every traversed peering direction; missing/false evidence should remain conservative `unknown`/no-path.
6. If UI behavior changed, run `scripts/path_analysis_visual_smoke.mjs` with backend/frontend running and keep the generated screenshots as temporary evidence
7. Use topology/manual modeling as needed
8. Save important states as server snapshots
9. Compare two server snapshots in the UI when you need a quick metadata-level delta for visible/loaded nodes, edges, scope, or compare refs
10. Use Cost Insights and Simulation pages for rule-based planning; scope cost/simulation fit with resource limits before exporting reports
11. Before risky local cleanup, run `scripts/backup_sqlite.sh` and `scripts/sqlite_health_check.py`
12. If `sqlite_health_check.py` reports `orphan_archives` or archive threshold warnings, treat it as an action signal only. Historical smoke/test archives can produce warnings even when acceptance passes. Do not delete or reconcile archives during routine use without a fresh backup, dry-run candidate review, and explicit approval.

## Known personal-use limits

- This is a single-user local/dev app.
- Azure credentials are server-side configured; there is no user login or permission model yet.
- Snapshot thumbnails are optional and can be removed by guard checks.
- Snapshot payloads store view state and metadata; raw topology archives are stored separately when topology archive paths are invoked.
- Snapshot compare UI is metadata-first with bounded raw topology diff drilldown/export when archives are available.
- Topology archive retention is health-signal/design only. No auto-prune path exists; any archive cleanup requires backup, dry-run, and explicit approval. `scripts/archive_retention_dry_run.py` is read-only and requires `--dry-run`; pytest also covers the dry-run CLI contract.
- Cost Intelligence is currently rule-based and does not ingest actual Azure Cost Management dollar amounts yet.
- Simulation templates are intentionally non-deployable planning outlines until API versions, SKU choices, dependencies, and required properties are validated.
- Browser/local dev ports are assumed to be `8000` and `5173` unless overridden by environment variables.
