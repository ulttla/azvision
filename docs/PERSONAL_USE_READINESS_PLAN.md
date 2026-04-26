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
- Treat external deployment, user login, multi-user permission model, object-storage thumbnail redesign, cost intelligence, simulation, and AI copilot as deferred product-track work.

## v0.9 in scope

1. Local execution
   - one-command dev stack start path
   - health check path
   - documented URLs
2. Real data readiness
   - Azure credential/config check
   - live read-test
   - topology probe with network inference
3. Core workflow readiness
   - topology view usable baseline
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

## v0.9 out of scope

- public deployment
- user login / account management
- multi-user collaboration / permissions
- object storage for thumbnails
- full historical Azure inventory archive
- cost intelligence / simulation / AI copilot
- Azure write/remediation operations

## Acceptance checklist

Run from `/Users/gun/dev/azvision`.

```bash
bash scripts/check_doc_mirror.sh
bash -n scripts/run_dev.sh
bash -n scripts/check_personal_use_ready.sh
bash -n scripts/backup_sqlite.sh
bash -n scripts/verify_sqlite_backup.sh
bash -n scripts/personal_use_smoke.sh
scripts/check_personal_use_ready.sh
npm --prefix frontend run build
cd backend && .venv/bin/python -m pytest -q
```

With backend running:

```bash
scripts/personal_use_smoke.sh
scripts/backup_sqlite.sh
scripts/verify_sqlite_backup.sh
```

Expected result:
- `personal_use_smoke.sh` prints `PASS: AzVision personal-use smoke completed` and verifies smoke workspace cleanup
- backend tests pass
- frontend build passes
- backup manifest exists under `backups/sqlite/<timestamp>/manifest.txt`, records `integrity_check=ok`, and passes `scripts/verify_sqlite_backup.sh`
- readiness preflight reports required local prerequisites, optional local DB presence, and config booleans without printing secret values
- docs mirror check shows only expected deferred drift

## Go / no-go rule

### Go for personal use
- health check passes
- Azure read-test passes or live dependency is explicitly skipped for offline work
- topology smoke returns at least one node
- manual node/edge path passes
- snapshot create/list/detail/restore path passes
- smoke-created manual/snapshot records are cleaned up
- backup script creates a manifest

### No-go until fixed
- backend cannot start
- frontend build fails on current branch
- snapshot restore path fails
- manual modeling creates unclean or unremovable records
- backup script cannot locate/copy SQLite DBs when local state exists
- live Azure errors are unexplained and not clearly an external credential/network issue

## Next development priorities after v0.9

1. Add a lightweight UI/readiness badge or health panel only if daily use shows repeated friction.
2. Add PDF export smoke if PDF becomes part of the immediate personal workflow.
3. Revisit Azure Arc / hybrid relation expansion only after the current topology/snapshot loop is comfortable.
4. Re-enter productization planning separately when external-user goals return.
