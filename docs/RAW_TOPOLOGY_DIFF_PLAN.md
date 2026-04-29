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
  - snapshot create auto-archive helper when a topology payload is available.
  - archive size/count reporting in `scripts/sqlite_health_check.py`.
  - `scripts/topology_archive_smoke.mts` included in `npm --prefix frontend run smoke:semantics`.

Current non-goals:

- The default UI compare button is still metadata-level first.
- Snapshot restore does not replay historical raw topology archives.
- Full UI diff viewer, markdown export, and formal retention policy are not implemented yet.

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

- UI sections for resource/edge-level delta.
- Human-friendly diff summaries and markdown export.
- Explicit archive retention/size limit policy beyond health reporting.

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

### Phase R3: UI surfacing — next

- Keep current compare button.
- Show metadata deltas first.
- If archive diff is available, show resource/edge-level sections.
- Make export/download of diff markdown optional.

### Phase R4: retention and bloat guard — partial

- Done: archive count/bytes in `scripts/sqlite_health_check.py`.
- Next: max archive byte guard before write.
- Next: explicit retention policy for local SQLite.
- Consider external object storage only if local SQLite bloat becomes measurable.

## Acceptance gates

Current gates:

- Existing snapshot CRUD and metadata compare tests keep passing.
- Existing snapshots without archives compare successfully with metadata fallback.
- Archive diff unit tests cover node/edge add/remove/change and missing archive fallback.
- `scripts/snapshot_compare_smoke.sh` continues to pass.
- `npm --prefix frontend run smoke:semantics` includes `scripts/topology_archive_smoke.mts`.
- SQLite health check reports archive count/bytes once archive table exists.

Next gates for R3/R4:

- UI compare remains metadata-first and does not hide missing archive fallback.
- Large archive/diff output is bounded before UI rendering.
- Markdown export, if added, uses the same bounded summary model.
- Retention guard has tests for oversized payload and missing archive fallback.

## Risks

- Payload bloat if raw Azure responses are stored without normalization.
- Confusing restore semantics if archive replay is mixed with current topology reload.
- False positive diffs if ordering or volatile fields are not normalized.
- Large UI diffs can overwhelm daily use; summaries and limits are required.

## Current decision

R1/R2 are accepted as backend/API foundation. The next safe product slice is R3 UI surfacing or R4 retention guard, not a broader rewrite of snapshot history or restore semantics.
