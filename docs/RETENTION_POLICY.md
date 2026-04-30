# Snapshot Topology Archive Retention Policy

## Purpose

AzVision stores bounded raw topology archives so snapshot compare can explain which Azure resources and relationships changed between captures. Retention exists to prevent local SQLite bloat without silently deleting useful comparison evidence.

This policy is for Gun's single-user local AzVision mode. Product or multi-user retention rules are deferred.

## Current guard layers

### 1. Write-time guard

- `MAX_TOPOLOGY_ARCHIVE_BYTES = 1_000_000` rejects oversized normalized archives before repository write.
- Snapshot delete cascades to `snapshot_topology_archives`, so new snapshot deletions do not leave orphan archive rows.
- Snapshot compare remains read-only and must never delete archives.

### 2. Health signals

`scripts/sqlite_health_check.py` reports:

- `archive_count`
- `archive_total_bytes`
- `orphan_archives`

Recommended warning thresholds:

| Signal | Warning threshold | Meaning |
| --- | ---: | --- |
| Archive count | `> 50` per database | Local history may need review |
| Archive bytes | `> 10 MB` per database | Archive storage is growing beyond normal single-user use |
| Oldest archive age | `> 90 days` | Historical archive may be stale |
| Orphan archives | `> 0` | Pre-cascade or inconsistent rows need explicit reconciliation |

Warnings are informational. They must not trigger automatic deletion.

Current local smoke may report orphan archive rows in `azvision.db` or `backend/azvision.db` when historical test/smoke data predates the delete-cascade guard. That state is a review signal, not a failure by itself. Do not reconcile or delete those rows during routine acceptance; first take a SQLite backup, run a dry-run candidate review, and get explicit approval for any cleanup.

### 3. User-initiated prune only

AzVision must not auto-prune topology archives in single-user mode. Any archive deletion outside normal snapshot delete must be explicitly requested by the user and preceded by a dry run.

Current helper:

```bash
python3 scripts/archive_retention_dry_run.py --db backend/azvision.db --workspace local-demo --dry-run
```

This helper is intentionally dry-run-only. It opens SQLite in read-only mode and has no delete or commit path.

## Eligibility rules for future prune design

| Rule | Behavior |
| --- | --- |
| Pinned snapshot | Never prune |
| Archived snapshot | Never prune |
| Recent archives | Keep at least the 5 most recent archives |
| Unpinned, active snapshots older than the safety floor | Eligible only in dry-run candidate selection |
| Orphan archive rows | Handle with explicit reconciliation, not broad retention pruning |
| Empty or unchanged diff evidence | Keep; “no change” is useful evidence |

## Dry-run candidate design

Any future prune endpoint must start with dry-run mode. The current script-level helper is `scripts/archive_retention_dry_run.py` and is limited to candidate selection.

Expected dry-run output:

```json
{
  "workspace_id": "local-demo",
  "dry_run": true,
  "candidate_count": 0,
  "candidate_snapshot_ids": [],
  "estimated_freed_bytes": 0,
  "reasons": []
}
```

Commit mode, if ever added, must require an explicit confirmation flag and must not run from background cron.

## No-go conditions

- No automatic archive deletion from cron, compare, health check, or app startup.
- No deletion of pinned snapshots or their archives.
- No deletion of archived snapshots or their archives.
- No deletion without a prior dry-run candidate list.
- No deletion without explicit user confirmation.
- No weakening of the 1 MB normalized archive guard.
- No retention rule based on diff content such as “empty diff”.
- No hidden UI behavior that deletes archives without showing a result.

## Test requirements before prune implementation

Before any prune code can write to SQLite:

1. Candidate selection tests for pinned, archived, safety floor, oldest-first ordering, below-threshold cases, orphan protection, and cross-workspace isolation. Current coverage: `backend/tests/test_archive_retention_dry_run.py` plus `python3 scripts/archive_retention_dry_run_selftest.py`.
2. Dry-run CLI smoke proving `--dry-run` enforcement and JSON output. Current coverage: `backend/tests/test_archive_retention_dry_run.py`; optional local smoke: `python3 scripts/archive_retention_dry_run.py --db backend/azvision.db --workspace local-demo --dry-run`.
3. Integration test for any future prune endpoint in dry-run mode only.
4. Health-check tests for threshold warnings. Current script-level self-test: `python3 scripts/sqlite_health_check_selftest.py`.
5. Manual approval for any real deletion or cleanup operation.

## Current decision

Current R4 scope includes health signals, design, and a dry-run-only candidate selector. Actual prune/delete CLI, API implementation, and existing orphan cleanup are deferred until explicit approval.
