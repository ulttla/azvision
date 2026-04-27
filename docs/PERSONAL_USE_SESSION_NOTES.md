# AzVision Personal Use Session Notes

This file captures short, operator-facing notes for the personal-use readiness baseline. It is not a product roadmap.

## Current personal-use verdict

- **v0.9 status:** usable for Gun single-user local/dev workflows after running acceptance.
- **Primary command:** `scripts/personal_use_acceptance.sh`
- **Daily start:** `scripts/run_dev.sh`
- **Daily smoke:** `scripts/personal_use_smoke.sh`
- **Data safety:** `scripts/backup_sqlite.sh` followed by `scripts/verify_sqlite_backup.sh`

## What was validated

- backend health endpoint
- frontend dev server root response
- Azure config/read-test
- live topology projection with network inference
- Network Path Analysis endpoint smoke on live topology resources when available
- manual node/edge create-update-cleanup path
- snapshot create/list/detail/restore-cleanup path
- backend full test suite
- frontend production build
- SQLite backup with SHA-256 and `integrity_check=ok`
- SQLite backup verifier
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

## Known non-blocking limits

- This remains local/dev single-user use, not external product deployment.
- Snapshot stores view state and metadata, not a full Azure inventory archive.
- Network Path Analysis is conservative: missing/ambiguous NSG or route data remains `unknown` rather than assumed allowed.
- Thumbnail preview is optional and may be removed by guard checks.
- Azure live smoke depends on local credentials, certificate path, and network access.
- Product-track items remain deferred: login, multi-user permissions, object storage thumbnails, cost intelligence, simulation, AI copilot.

## If something fails

1. Run `scripts/check_personal_use_ready.sh`.
2. If backend fails, inspect `.env`, certificate path, and `backend/.venv`.
3. If live Azure smoke fails, run `scripts/live_topology_probe.sh` to separate credential/network issues from app issues.
4. If backup fails, do not delete local DBs; rerun `scripts/backup_sqlite.sh` and `scripts/verify_sqlite_backup.sh`.
5. If workflow smoke leaves records behind, rerun with a fresh `AZVISION_SMOKE_WORKSPACE_ID` and inspect manual/snapshot list endpoints for the old smoke workspace.
