# Raw Topology Diff Plan

## Purpose

AzVision snapshot compare originally compared saved view-state metadata only: counts, scope fields, and compare refs. That is still the default UI compare path and remains useful for quick daily-use checks, but it cannot answer: "which resources or relationships changed between two topology captures?"

This plan defines the safe path from metadata-level compare to raw topology archival diff without turning snapshot history into a full revision-control system.

## Current baseline

Implemented:

- Server-backed snapshot/history stores view state and metadata in SQLite.
- `POST /workspaces/{workspace_id}/snapshots/compare` returns metadata deltas.
- Snapshot restore intentionally reuses current topology loading behavior rather than replaying old raw inventory.
- Thumbnail storage remains inline and guarded; object storage is still deferred.
- Raw Topology Diff R1/R2 backend foundation is implemented:
  - `snapshot_topology_archives` table and workspace/snapshot index.
  - `TopologyArchiveRepository` store/get/delete/list/count/size methods.
  - deterministic topology normalization and SHA-256 hash utility.
  - `POST /workspaces/{workspace_id}/snapshots/{snapshot_id}/topology-archive`.
  - `POST /workspaces/{workspace_id}/snapshots/compare/topology` with metadata fallback when an archive is missing.
  - snapshot create accepts optional `topology` payload and auto-archives it when nodes are present.
  - archive size/count reporting in `scripts/sqlite_health_check.py`.
  - `scripts/topology_archive_smoke.mts` included in `npm --prefix frontend run smoke:semantics`.

Current non-goals:

- The default UI compare button remains metadata-level first, with raw topology diff shown as an additional result panel when archives are available.
- Snapshot restore does not replay historical raw topology archives.
- Detailed expandable per-resource/per-edge drilldown and bounded markdown export are implemented in the raw diff card; real retention prune/delete execution remains deferred.

## Product gap

Metadata-level compare can say:

- visible nodes changed by `+3`
- edge count changed by `-1`
- scope/query changed
- compare refs were added or removed

Archive-level compare can now support API results for:

- resource `A` added or removed
- edge `A -> B` added or removed
- resource type/tag/location changed when normalized fields differ
- missing archive fallback with metadata delta preserved

Still missing for product use:

- Expandable detailed UI drilldown for individual resource/edge delta rows is implemented with bounded sections, including changed-node and changed-edge before/after detail when the backend returns it.
- Markdown export includes bounded added/removed/changed node sections and added/removed/changed edge sections.
- Explicit archive retention/size limit policy beyond health reporting, write-time size guard, and dry-run candidate selection remains approval-gated for real prune/delete.

## Design principles

1. Keep daily-use snapshot restore simple. Raw topology archives should power diff/reporting, not replace current restore behavior.
2. Store normalized, bounded payloads. Do not archive unlimited raw Azure API responses.
3. Keep manual overlay and Azure-derived topology distinguishable.
4. Make archival optional per snapshot capture version so existing snapshots remain valid.
5. Prefer deterministic hashes and summaries before large payload storage.

## Data model

Archive table:

```sql
CREATE TABLE IF NOT EXISTS snapshot_topology_archives (
    snapshot_id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    archive_version INTEGER NOT NULL DEFAULT 1,
    topology_hash TEXT NOT NULL,
    nodes_json TEXT NOT NULL,
    edges_json TEXT NOT NULL,
    node_count INTEGER NOT NULL DEFAULT 0,
    edge_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
)
```

Archive payload shape:

```json
{
  "nodes": [
    {
      "node_key": "resource:/subscriptions/...",
      "node_type": "resource",
      "node_ref": "/subscriptions/...",
      "display_name": "vm-app",
      "source": "azure",
      "resource_type": "Microsoft.Compute/virtualMachines",
      "location": "canadacentral",
      "tags": { "environment": "prod" }
    }
  ],
  "edges": [
    {
      "source_node_key": "resource:...",
      "target_node_key": "resource:...",
      "relation_type": "contains",
      "source": "azure"
    }
  ]
}
```

Normalization:

- Sort nodes by `node_key`.
- Sort edges by `(source_node_key, target_node_key, relation_type, source)`.
- Strip UI-only layout state.
- Keep only diff-relevant attributes.
- Hash canonical JSON for quick equality checks.

## API expansion

Existing metadata compare response stays stable.

Implemented endpoints:

1. `POST /workspaces/{workspace_id}/snapshots/{snapshot_id}/topology-archive`
2. `POST /workspaces/{workspace_id}/snapshots/compare/topology`

Diff response shape:

```json
{
  "ok": true,
  "workspace_id": "local-demo",
  "base_snapshot_id": "snap_a",
  "target_snapshot_id": "snap_b",
  "archive_status": "available",
  "node_delta": {
    "added": [],
    "removed": [],
    "changed": []
  },
  "edge_delta": {
    "added": [],
    "removed": [],
    "changed": []
  },
  "summary": []
}
```

If either snapshot lacks an archive, return `archive_status=missing`, `ok=false`, and include existing metadata compare in `metadata_delta` as fallback.

## Implementation phases

### Phase R1: contract and archive writer — done

- Archive table and repository methods.
- Normalizer + canonical hash utility.
- Store endpoint and smoke coverage.
- Existing snapshots remain metadata-only unless an archive is written later.

### Phase R2: backend topology diff — done

- Archive-aware compare endpoint.
- Added/removed/changed nodes and edges with bounded list limits.
- Tests for same archive, node add/remove/change, edge add/remove/change, max-items bound, and missing archive fallback.

### Phase R3: UI surfacing — done for current bounded slice

- Done: current compare button still runs metadata compare first.
- Done: UI now calls `POST /snapshots/compare/topology` after metadata compare in server snapshot mode.
- Done: snapshot panel shows a bounded raw topology diff result card with archive status, node/edge add/remove/changed counts, summary lines, missing-archive fallback copy, expandable per-category drilldown, changed node before/after details, 50-row display caps, and richer markdown export.
- Done: `scripts/topology_page_semantics_smoke.mts` and `scripts/snapshot_compare_api_semantics_smoke.mts` include browserless coverage for the bounded drilldown/export path.
- Deferred: component-level interaction tests for expand/collapse can be added if a React testing stack is introduced.

### Phase R4: retention and bloat guard — done for bounded dry-run scope

- Done: archive count/bytes in `scripts/sqlite_health_check.py`.
- Done: normalized archive byte guard before write (`MAX_TOPOLOGY_ARCHIVE_BYTES = 1_000_000`).
- Done: snapshot deletion cascades to `snapshot_topology_archives` to avoid orphan archive rows.
- Done: explicit local SQLite retention policy in `docs/RETENTION_POLICY.md`.
- Done: dry-run-only candidate selector in `scripts/archive_retention_dry_run.py`; no delete/commit mode exists.
- Done: dry-run candidate selection protects pinned, archived, orphan, cross-workspace, and newest-floor rows before listing candidates.
- Consider external object storage only if local SQLite bloat becomes measurable.

## Acceptance gates

Current gates:

- Existing snapshot CRUD and metadata compare tests keep passing.
- Existing snapshots without archives compare successfully with metadata fallback.
- Archive diff unit tests cover node/edge add/remove/change and missing archive fallback.
- `scripts/snapshot_compare_smoke.sh` continues to pass.
- `npm --prefix frontend run smoke:semantics` includes `scripts/topology_archive_smoke.mts`.
- SQLite health check reports archive count/bytes once archive table exists.

Accepted R3/R4 bounded gates:

- UI compare remains metadata-first and does not hide missing archive fallback.
- Raw diff result card and markdown export keep explicit display limits for detailed rows.
- Snapshot delete keeps snapshot archive rows from becoming orphaned.
- Oversized normalized archive payload is rejected before repository write.
- Retention dry-run candidate selector protects pinned, archived, orphan, and newest floor archives before listing candidates.

Remaining deferred gates:

- API-level snapshot create `topology` payload -> auto archive -> compare integration coverage is implemented in `backend/tests/test_topology_archive_integration.py`.
- Real archive prune/delete behavior remains deferred and requires an explicit approval path; do not add write mode to the dry-run script by default.

## Risks

- Payload bloat if raw Azure responses are stored without normalization.
- Confusing restore semantics if archive replay is mixed with current topology reload.
- False positive diffs if ordering or volatile fields are not normalized.
- Large UI diffs can overwhelm daily use; summaries and limits are required.

## Current decision

R1/R2 are accepted as backend/API foundation. The current R3 bounded UI slice is implemented and reviewed. R4 now has local SQLite retention policy, health signals, delete-cascade guard, and a dry-run-only candidate selector. Real prune/delete behavior remains deferred and requires explicit approval.
