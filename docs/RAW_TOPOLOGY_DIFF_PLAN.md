# Raw Topology Diff Plan

## Purpose

AzVision snapshot compare currently compares saved view-state metadata only: counts, scope fields, and compare refs. This is useful for quick daily-use checks, but it cannot answer: "which resources or relationships changed between two topology captures?"

This plan defines the safe path from metadata-level compare to raw topology archival diff without turning snapshot history into a full revision-control system.

## Current baseline

Implemented today:

- Server-backed snapshot/history stores view state and metadata in SQLite.
- `POST /workspaces/{workspace_id}/snapshots/compare` returns metadata deltas.
- Snapshot restore intentionally reuses current topology loading behavior rather than replaying old raw inventory.
- Thumbnail storage remains inline and guarded; object storage is still deferred.

Explicit current non-goal:

- Snapshot records do not store full Azure topology payloads.

## Product gap

Metadata-level compare can say:

- visible nodes changed by `+3`
- edge count changed by `-1`
- scope/query changed
- compare refs were added or removed

It cannot say:

- resource `A` was added or removed
- edge `A -> B` changed
- resource type/tag/location changed
- manual overlay changed separately from Azure-derived topology

## Design principles

1. Keep daily-use snapshot restore simple. Raw topology archives should power diff/reporting, not replace current restore behavior.
2. Store normalized, bounded payloads. Do not archive unlimited raw Azure API responses.
3. Keep manual overlay and Azure-derived topology distinguishable.
4. Make archival optional per snapshot capture version so existing snapshots remain valid.
5. Prefer deterministic hashes and summaries before large payload storage.

## Proposed data model

Add a separate table rather than expanding `snapshots` directly:

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

Recommended normalization:

- Sort nodes by `node_key`.
- Sort edges by `(source_node_key, target_node_key, relation_type, source)`.
- Strip UI-only layout state.
- Keep only diff-relevant attributes.
- Hash canonical JSON for quick equality checks.

## API expansion

Keep existing metadata compare response stable. Add either:

1. `GET /workspaces/{workspace_id}/snapshots/{snapshot_id}/topology-archive`
2. `POST /workspaces/{workspace_id}/snapshots/compare/topology`

Preferred first implementation: option 2, because daily use wants a diff result rather than raw archive retrieval.

Proposed diff response fields:

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

If either snapshot lacks an archive, return `archive_status=missing` and keep the existing metadata compare as fallback.

## Implementation phases

### Phase R1: contract and archive writer

- Add archive table and repository methods.
- Add normalizer + canonical hash utility.
- Capture archive only for new server snapshots when topology payload is available from the frontend or backend capture path.
- Existing snapshots remain metadata-only.

### Phase R2: backend topology diff

- Add archive-aware compare service.
- Return added/removed/changed nodes and edges with bounded list limits.
- Add tests for same archive, node add/remove/change, edge add/remove/change, and missing archive fallback.

### Phase R3: UI surfacing

- Keep current compare button.
- Show metadata deltas first.
- If archive diff is available, show resource/edge-level sections.
- Make export/download of diff markdown optional.

### Phase R4: retention and bloat guard

- Add archive size signals to `scripts/sqlite_health_check.py`.
- Add max archive byte guard before write.
- Consider external object storage only if local SQLite bloat becomes measurable.

## Acceptance gates

- Existing snapshot CRUD and metadata compare tests keep passing.
- Existing snapshots without archives compare successfully with metadata fallback.
- New archive diff unit tests cover node/edge add/remove/change.
- `scripts/snapshot_compare_smoke.sh` continues to pass.
- Add a future `scripts/snapshot_topology_diff_smoke.sh` once API exists.
- SQLite health check reports archive count/bytes once archive table exists.

## Risks

- Payload bloat if raw Azure responses are stored without normalization.
- Confusing restore semantics if archive replay is mixed with current topology reload.
- False positive diffs if ordering or volatile fields are not normalized.
- Large UI diffs can overwhelm daily use; summaries and limits are required.

## Decision for current chunk

Do not implement raw topology archival inside the current hardening chunk. The current scope should finish with stronger acceptance, cost/simulation smoke coverage, and FE semantics gates. Raw topology diff should start only after the archive shape and retention guard above are accepted.
