from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from app.repositories.snapshots import SnapshotRepository
from app.schemas.snapshots import (
    SnapshotCompareCountDelta,
    SnapshotCompareRefDelta,
    SnapshotCompareResponse,
    SnapshotCompareScopeDelta,
    SnapshotCreateRequest,
    SnapshotListQuery,
    SnapshotRecord,
    SnapshotSummaryRecord,
    SnapshotUpdateRequest,
)
from app.services.topology_normalizer import normalize_topology


class SnapshotNotFoundError(RuntimeError):
    pass


class SnapshotService:
    def __init__(self, repository: SnapshotRepository | None = None):
        self.repository = repository or SnapshotRepository()

    def list_snapshots(self, workspace_id: str, query: SnapshotListQuery | None = None) -> list[SnapshotSummaryRecord]:
        list_query = query or SnapshotListQuery()
        return [
            SnapshotSummaryRecord.model_validate(item)
            for item in self.repository.list_by_workspace(
                workspace_id,
                sort_by=list_query.sort_by,
                sort_order=list_query.sort_order,
                include_archived=list_query.include_archived,
                pinned_first=list_query.pinned_first,
            )
        ]

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
                "selected_subscription_id": payload.selected_subscription_id,
                "resource_group_name": payload.resource_group_name,
                "topology_generated_at": payload.topology_generated_at,
                "visible_node_count": payload.visible_node_count,
                "loaded_node_count": payload.loaded_node_count,
                "edge_count": payload.edge_count,
                "thumbnail_data_url": payload.thumbnail_data_url,
                "captured_at": payload.captured_at or now,
                "created_at": now,
                "updated_at": now,
                "last_restored_at": "",
                "restore_count": 0,
                "is_pinned": False,
                "archived_at": "",
            }
        )
        # Auto-archive topology if payload contains nodes/edges
        self._archive_topology_if_available(
            record["id"],
            workspace_id,
            payload,
        )

        return SnapshotRecord.model_validate(record)

    def _archive_topology_if_available(
        self,
        snapshot_id: str,
        workspace_id: str,
        payload: SnapshotCreateRequest,
    ) -> None:
        """Archive topology data if the create payload includes nodes and edges.

        This is called automatically during snapshot creation when the frontend
        sends topology data alongside the snapshot metadata.
        """
        topology_data = getattr(payload, "topology", None)
        if topology_data is None:
            return

        try:
            normalized = normalize_topology(topology_data)
        except Exception:
            return  # Best-effort: skip archive on normalization failure

        if normalized["node_count"] == 0:
            return

        from app.repositories.topology_archive import TopologyArchiveRepository

        TopologyArchiveRepository.store(
            snapshot_id=snapshot_id,
            workspace_id=workspace_id,
            nodes_json=normalized["nodes_json"],
            edges_json=normalized["edges_json"],
            topology_hash=normalized["topology_hash"],
            node_count=normalized["node_count"],
            edge_count=normalized["edge_count"],
        )

    def update_snapshot(
        self,
        workspace_id: str,
        snapshot_id: str,
        payload: SnapshotUpdateRequest,
    ) -> SnapshotRecord:
        patch = payload.model_dump(exclude_none=True)
        if "archived" in patch:
            archived = bool(patch.pop("archived"))
            patch["archived_at"] = datetime.now(timezone.utc).isoformat() if archived else ""
        patch["updated_at"] = datetime.now(timezone.utc).isoformat()

        snapshot = self.repository.update(workspace_id, snapshot_id, patch)
        if snapshot is None:
            raise SnapshotNotFoundError(snapshot_id)
        return SnapshotRecord.model_validate(snapshot)

    def record_restore_event(self, workspace_id: str, snapshot_id: str) -> SnapshotRecord:
        snapshot = self.repository.record_restore(
            workspace_id,
            snapshot_id,
            datetime.now(timezone.utc).isoformat(),
        )
        if snapshot is None:
            raise SnapshotNotFoundError(snapshot_id)
        return SnapshotRecord.model_validate(snapshot)

    def compare_snapshots(
        self,
        workspace_id: str,
        base_snapshot_id: str,
        target_snapshot_id: str,
    ) -> SnapshotCompareResponse:
        base = self.get_snapshot(workspace_id, base_snapshot_id)
        target = self.get_snapshot(workspace_id, target_snapshot_id)

        base_refs = set(base.compare_refs)
        target_refs = set(target.compare_refs)
        added_refs = sorted(target_refs - base_refs)
        removed_refs = sorted(base_refs - target_refs)
        unchanged_refs = sorted(base_refs & target_refs)

        count_delta = SnapshotCompareCountDelta(
            visible_node_count=target.visible_node_count - base.visible_node_count,
            loaded_node_count=target.loaded_node_count - base.loaded_node_count,
            edge_count=target.edge_count - base.edge_count,
        )
        scope_delta = SnapshotCompareScopeDelta(
            scope_changed=target.scope != base.scope,
            query_changed=target.query != base.query,
            subscription_changed=target.selected_subscription_id != base.selected_subscription_id,
            resource_group_changed=target.resource_group_name != base.resource_group_name,
        )
        refs_delta = SnapshotCompareRefDelta(
            added=added_refs,
            removed=removed_refs,
            unchanged=unchanged_refs,
        )

        summary: list[str] = []
        if count_delta.visible_node_count:
            summary.append(f"visible_node_count {count_delta.visible_node_count:+d}")
        if count_delta.loaded_node_count:
            summary.append(f"loaded_node_count {count_delta.loaded_node_count:+d}")
        if count_delta.edge_count:
            summary.append(f"edge_count {count_delta.edge_count:+d}")
        if added_refs or removed_refs:
            summary.append(f"compare_refs +{len(added_refs)} / -{len(removed_refs)}")
        changed_scope_fields = [
            label
            for label, changed in [
                ("scope", scope_delta.scope_changed),
                ("query", scope_delta.query_changed),
                ("subscription", scope_delta.subscription_changed),
                ("resource_group", scope_delta.resource_group_changed),
            ]
            if changed
        ]
        if changed_scope_fields:
            summary.append("scope fields changed: " + ", ".join(changed_scope_fields))
        if not summary:
            summary.append("no metadata-level snapshot differences detected")

        return SnapshotCompareResponse(
            workspace_id=workspace_id,
            base_snapshot_id=base.id,
            target_snapshot_id=target.id,
            base_name=base.name,
            target_name=target.name,
            base_captured_at=base.captured_at,
            target_captured_at=target.captured_at,
            count_delta=count_delta,
            scope_delta=scope_delta,
            compare_refs_delta=refs_delta,
            summary=summary,
        )

    def delete_snapshot(self, workspace_id: str, snapshot_id: str) -> None:
        deleted = self.repository.delete(workspace_id, snapshot_id)
        if not deleted:
            raise SnapshotNotFoundError(snapshot_id)
