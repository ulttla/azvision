# AzVision Docs Mirror Policy

## Source of truth
- Canonical project documentation lives in `/Users/gun/dev/azvision/docs`.
- `/Users/gun/.openclaw/workspace/docs/azvision` is a read-mostly workspace cache for Discord recovery, reviewer packets, and long work window restarts.
- Google Docs development journal is the chronological worklog, not the docs mirror source of truth.

## Allowed workspace edits
- Workspace mirror edits are allowed only as temporary scratch during an active work window.
- Closeout must either back-port the edit to the repo or list it under `## Deferred Drift` below with reason, owner, and expiry.
- Do not treat a workspace commit as repo propagation. The repo needs its own commit when the canonical docs change.

## Sync rules
- Sync is explicit and per-file. Do not bulk overwrite either tree without first deciding direction per file.
- Secrets, `.env`, certificates, DB files, exports, runtime state, and generated artifacts are never mirror targets.
- When a repo doc changes and is needed for recovery or reviewer packets, copy that file to the workspace mirror in the same slice.
- When a workspace scratch edit becomes canonical, copy it back to the repo first, commit the repo, then refresh the workspace mirror.

## Validation
- For known mirrored files, `cmp -s` should succeed between repo and workspace copies.
- `diff -rq /Users/gun/dev/azvision/docs /Users/gun/.openclaw/workspace/docs/azvision` may report only entries listed under `## Deferred Drift`.
- Closeout should record repo SHA and workspace SHA when both trees were touched.

## Deferred Drift
| Path | Side | Reason | Owner | Expiry |
|---|---|---|---|---|
| `README.md` | workspace-only | Workspace mirror entrypoint and local operating note; not canonical project documentation. | NOVA | 2026-05-01 |

## Tooling
- `scripts/check_doc_mirror.sh` is visibility-only. It prints repo/workspace doc drift and always exits 0.
- Expected one-side-only entries must still be recorded under `## Deferred Drift`.

## Future, not in current slice
- Lightweight manifest if repeated drift remains painful.
- Optional pre-closeout checklist hook; no CI gate until the workflow stabilizes.
