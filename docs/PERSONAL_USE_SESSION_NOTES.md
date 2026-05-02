# AzVision Personal Use Session Notes

This file captures short, operator-facing notes for the personal-use readiness baseline. It is not a product roadmap.

## Current personal-use verdict

- **v0.9 status:** usable for Gun single-user local/dev workflows after running acceptance.
- **Primary command:** `scripts/personal_use_acceptance.sh`
- **Daily start:** `scripts/run_dev.sh`
- **Daily smoke:** `scripts/personal_use_smoke.sh`
- **Snapshot compare smoke:** `scripts/snapshot_compare_smoke.sh`
- **Cost smoke:** `scripts/cost_report_smoke.sh` and `scripts/cost_insights_smoke.sh`
- **Simulation smoke:** `scripts/simulation_smoke.sh`
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
- rule-based simulation create/list/detail/template/report/fit smoke
- run script start and stop cleanup behavior

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
scripts/simulation_smoke.sh
scripts/sqlite_health_check.py
python3 scripts/archive_retention_dry_run.py --db backend/azvision.db --workspace local-demo --dry-run
```

## Known non-blocking limits

- This remains local/dev single-user use, not external product deployment.
- Snapshot stores view state and metadata; raw topology archives are stored separately when topology archive paths are invoked.
- Snapshot compare UI is metadata-first and also surfaces bounded raw topology diff details/markdown export when archives are available. Real archive prune/delete remains approval-gated; routine acceptance only runs dry-run candidate review.
- Network Path Analysis is conservative: missing/ambiguous NSG or route data remains `unknown` rather than assumed allowed.
- Thumbnail preview is optional and may be removed by guard checks.
- `scripts/run_dev.sh` uses `backend/azvision.db` with the current relative SQLite URL. A root-level `azvision.db` may still exist as legacy state and is backed up, but should not be moved or reconciled without explicit approval.
- Azure live smoke depends on local credentials, certificate path, and network access.
- Productization items remain deferred: login, multi-user permissions, object storage thumbnails, real Azure Cost Management ingestion, deployable simulation templates, and LLM-backed copilot.

## If something fails

1. Run `scripts/check_personal_use_ready.sh`.
2. If backend fails, inspect `.env`, certificate path, and `backend/.venv`.
3. If live Azure smoke fails, run `scripts/live_topology_probe.sh` to separate credential/network issues from app issues.
4. If backup fails, do not delete local DBs; rerun `scripts/backup_sqlite.sh` and `scripts/verify_sqlite_backup.sh`.
5. If `sqlite_health_check.py` reports orphan archives, treat it as an action signal only; run the retention dry-run and request explicit approval before any cleanup.
6. If workflow smoke leaves records behind, rerun with a fresh `AZVISION_SMOKE_WORKSPACE_ID` and inspect manual/snapshot list endpoints for the old smoke workspace.
