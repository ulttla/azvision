# Retention Execution Guard

Snapshot topology archive retention is currently dry-run only. This guard defines what must exist before any real prune/delete path can be implemented.

## Current state

- `scripts/archive_retention_dry_run.py` is read-only and requires `--dry-run`.
- `docs/RETENTION_POLICY.md` forbids automatic archive deletion.
- SQLite health checks may report old or orphan archive rows, but routine acceptance treats them as review signals only.

## Required gates before write mode

A real prune/delete path must not exist until all gates below are complete:

1. Fresh SQLite backup and verification.
2. Dry-run candidate list reviewed by the user.
3. Explicit user approval for the exact database and workspace.
4. Protection tests for pinned snapshots, archived snapshots, recent floor, orphan archives, and cross-workspace isolation.
5. Visible result report with deleted ids, retained ids, and backup path.
6. No cron or startup path can call write-mode retention.

## Future command shape

If write mode is added later, it should require an explicit confirmation token, for example:

```bash
python3 scripts/archive_retention_prune.py \
  --db backend/azvision.db \
  --workspace local-demo \
  --candidate-file reviewed-candidates.json \
  --confirm-delete-archives
```

The current dry-run script must remain read-only.

## Public beta decision

Public beta can proceed with dry-run retention only if:

- hosted data backup is documented,
- retention warnings are visible to operators,
- real deletion is manual and approval-gated,
- orphan cleanup is not automatic.

## No-go

- No deletion from health check.
- No deletion from compare routes.
- No deletion from cron.
- No deletion without backup and explicit user confirmation.
- No deletion of pinned or archived snapshot evidence.
