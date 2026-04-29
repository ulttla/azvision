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

### 3. User-initiated prune only

AzVision must not auto-prune topology archives in single-user mode. Any archive deletion outside normal snapshot delete must be explicitly requested by the user and preceded by a dry run.

## Eligibility rules for future prune design

| Rule | Behavior |
| --- | --- |
| Pinned snapshot | Never prune |
| Archived snapshot | Never prune |
| Recent archives | Keep at least the 5 most recent archives |
| Unpinned, active snapshots older than the safety floor | Eligible only in dry-run candidate selection |
| Orphan archive rows | Handle with explicit reconciliation, not broad retention pruning |
| Empty or unchanged diff evidence | Keep; “no change” is useful evidence |

## Future dry-run design

Any future prune helper or endpoint must start with dry-run mode.

Suggested CLI shape:

```bash
python scripts/prune_archives.py --workspace local-demo --dry-run
```

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

1. Candidate selection unit tests for pinned, archived, safety floor, oldest-first ordering, and below-threshold cases.
2. Dry-run smoke test proving zero side effects.
3. Integration test for any prune endpoint in dry-run mode only.
4. Health-check tests for threshold warnings.
5. Manual approval for any real deletion or cleanup operation.

## Current decision

Current R4 scope is limited to health signals and design. Actual prune CLI/API implementation and existing orphan cleanup are deferred until explicit approval.
