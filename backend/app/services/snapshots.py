from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from app.repositories.snapshots import SnapshotRepository
from app.schemas.snapshots import SnapshotCreateRequest, SnapshotRecord, SnapshotUpdateRequest


class SnapshotNotFoundError(RuntimeError):
    pass


class SnapshotService:
    def __init__(self, repository: SnapshotRepository | None = None):
        self.repository = repository or SnapshotRepository()

    def list_snapshots(self, workspace_id: str) -> list[SnapshotRecord]:
        return [SnapshotRecord.model_validate(item) for item in self.repository.list_by_workspace(workspace_id)]

    def get_snapshot(self, workspace_id: str, snapshot_id: str) -> SnapshotRecord:
        snapshot = self.repository.get(workspace_id, snapshot_id)
        if snapshot is None:
            raise SnapshotNotFoundError(snapshot_id)
        return SnapshotRecord.model_validate(snapshot)

    def create_snapshot(self, workspace_id: str, payload: SnapshotCreateRequest) -> SnapshotRecord:
        now = datetime.now(timezone.utc).isoformat()
        record = self.repository.create(
            {
                "id": f"snap_{uuid4().hex[:12]}",
                "workspace_id": workspace_id,
                "preset_version": payload.preset_version,
                "name": payload.name,
                "note": payload.note,
                "compare_refs": payload.compare_refs,
                "cluster_children": payload.cluster_children,
                "scope": payload.scope,
                "query": payload.query,
                "resource_group_name": payload.resource_group_name,
                "topology_generated_at": payload.topology_generated_at,
                "visible_node_count": payload.visible_node_count,
                "loaded_node_count": payload.loaded_node_count,
                "edge_count": payload.edge_count,
                "thumbnail_data_url": payload.thumbnail_data_url,
                "created_at": now,
                "updated_at": now,
            }
        )
        return SnapshotRecord.model_validate(record)

    def update_snapshot(
        self,
        workspace_id: str,
        snapshot_id: str,
        payload: SnapshotUpdateRequest,
    ) -> SnapshotRecord:
        patch = payload.model_dump(exclude_none=True)
        patch["updated_at"] = datetime.now(timezone.utc).isoformat()

        snapshot = self.repository.update(workspace_id, snapshot_id, patch)
        if snapshot is None:
            raise SnapshotNotFoundError(snapshot_id)
        return SnapshotRecord.model_validate(snapshot)

    def delete_snapshot(self, workspace_id: str, snapshot_id: str) -> None:
        deleted = self.repository.delete(workspace_id, snapshot_id)
        if not deleted:
            raise SnapshotNotFoundError(snapshot_id)
