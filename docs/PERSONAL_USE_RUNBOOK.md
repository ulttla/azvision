# AzVision Personal Use Runbook

Purpose: make AzVision usable as Gun's single-user local/dev app without opening external productization scope.

## Readiness target
- Target: personal-use v0.9
- In scope: local backend/frontend execution, Azure read diagnostics, topology view, manual modeling, server-backed snapshot/history, SQLite backup/restore path, quick smoke validation
- Out of scope: public deployment, user login, multi-user permissions, object storage thumbnails, cost intelligence, simulation, AI copilot

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

Snapshot compare is available for server snapshots. In the UI, click `Set compare base` on one snapshot, then `Compare` on another snapshot. The current first pass compares saved view-state metadata, not raw Azure topology archives. For focused API smokes with the backend running:

```bash
cd /Users/gun/dev/azvision
scripts/snapshot_compare_smoke.sh
scripts/cost_report_smoke.sh
scripts/cost_insights_smoke.sh
scripts/simulation_smoke.sh
scripts/sqlite_health_check.py
```

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
5. For network troubleshooting, select source/destination resource nodes and run Network Path Analysis with only the filters you need (`source_port` is usually optional)
6. If UI behavior changed, run `scripts/path_analysis_visual_smoke.mjs` with backend/frontend running and keep the generated screenshots as temporary evidence
7. Use topology/manual modeling as needed
8. Save important states as server snapshots
9. Compare two server snapshots when you need a quick metadata-level delta for visible/loaded nodes, edges, scope, or compare refs
10. Use Cost Insights and Simulation pages for rule-based planning; scope cost/simulation fit with resource limits before exporting reports
11. Before risky local cleanup, run `scripts/backup_sqlite.sh` and `scripts/sqlite_health_check.py`

## Known personal-use limits

- This is a single-user local/dev app.
- Azure credentials are server-side configured; there is no user login or permission model yet.
- Snapshot thumbnails are optional and can be removed by guard checks.
- Snapshot payloads store view state and metadata, not a full historical Azure inventory archive.
- Snapshot compare is metadata-level only for now; full raw topology diff remains product-track work.
- Cost Intelligence is currently rule-based and does not ingest actual Azure Cost Management dollar amounts yet.
- Simulation templates are intentionally non-deployable planning outlines until API versions, SKU choices, dependencies, and required properties are validated.
- Browser/local dev ports are assumed to be `8000` and `5173` unless overridden by environment variables.
