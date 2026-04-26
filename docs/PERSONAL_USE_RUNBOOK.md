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

## Personal-use smoke

Run this after starting the backend. It checks backend health, live Azure read/topology, manual node/edge CRUD, snapshot create/list/detail/restore, and cleanup of smoke-created records.

```bash
cd /Users/gun/dev/azvision
scripts/personal_use_smoke.sh
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
5. Use topology/manual modeling as needed
6. Save important states as server snapshots
7. Before risky local cleanup, run `scripts/backup_sqlite.sh`

## Known personal-use limits

- This is a single-user local/dev app.
- Azure credentials are server-side configured; there is no user login or permission model yet.
- Snapshot thumbnails are optional and can be removed by guard checks.
- Snapshot payloads store view state and metadata, not a full historical Azure inventory archive.
- Browser/local dev ports are assumed to be `8000` and `5173` unless overridden by environment variables.
