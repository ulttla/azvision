from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, HTTPException

from app.schemas.snapshots import (
    SnapshotCompareRequest,
    SnapshotCompareResponse,
    SnapshotCreateRequest,
    SnapshotListQuery,
    SnapshotListResponse,
    SnapshotRecord,
    SnapshotSummaryRecord,
    SnapshotUpdateRequest,
)
from app.schemas.topology_archive import (
    TopologyArchiveRequest,
    TopologyArchiveResponse,
    TopologyDiffResponse,
)
from app.services.snapshots import SnapshotNotFoundError, SnapshotService
from app.services.topology_normalizer import normalize_topology, topology_diff

router = APIRouter(prefix="/workspaces/{workspace_id}/snapshots", tags=["snapshots"])
service = SnapshotService()


@router.get("", response_model=SnapshotListResponse)
def list_snapshots(
    workspace_id: str,
    sort_by: Literal["updated_at", "captured_at", "last_restored_at"] = "last_restored_at",
    sort_order: Literal["asc", "desc"] = "desc",
    include_archived: bool = True,
    pinned_first: bool = True,
) -> SnapshotListResponse:
    query = SnapshotListQuery(
        sort_by=sort_by,
        sort_order=sort_order,
        include_archived=include_archived,
        pinned_first=pinned_first,
    )
    return SnapshotListResponse(workspace_id=workspace_id, items=service.list_snapshots(workspace_id, query))


@router.post("", response_model=SnapshotRecord)
def create_snapshot(workspace_id: str, payload: SnapshotCreateRequest) -> SnapshotRecord:
    return service.create_snapshot(workspace_id, payload)


@router.post("/compare", response_model=SnapshotCompareResponse)
def compare_snapshots(workspace_id: str, payload: SnapshotCompareRequest) -> SnapshotCompareResponse:
    try:
        return service.compare_snapshots(
            workspace_id,
            payload.base_snapshot_id,
            payload.target_snapshot_id,
        )
    except SnapshotNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Snapshot not found") from exc


@router.get("/{snapshot_id}", response_model=SnapshotRecord)
def get_snapshot(workspace_id: str, snapshot_id: str) -> SnapshotRecord:
    try:
        return service.get_snapshot(workspace_id, snapshot_id)
    except SnapshotNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Snapshot not found") from exc


@router.patch("/{snapshot_id}", response_model=SnapshotRecord)
def update_snapshot(
    workspace_id: str,
    snapshot_id: str,
    payload: SnapshotUpdateRequest,
) -> SnapshotRecord:
    try:
        return service.update_snapshot(workspace_id, snapshot_id, payload)
    except SnapshotNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Snapshot not found") from exc


@router.post("/{snapshot_id}/restore-events", response_model=SnapshotRecord)
def record_snapshot_restore_event(workspace_id: str, snapshot_id: str) -> SnapshotRecord:
    try:
        return service.record_restore_event(workspace_id, snapshot_id)
    except SnapshotNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Snapshot not found") from exc


@router.delete("/{snapshot_id}")
def delete_snapshot(workspace_id: str, snapshot_id: str) -> dict[str, str]:
    try:
        service.delete_snapshot(workspace_id, snapshot_id)
    except SnapshotNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Snapshot not found") from exc

    return {
        "workspace_id": workspace_id,
        "snapshot_id": snapshot_id,
        "status": "deleted",
    }


# ============================================================
# Topology Archive endpoints
# ============================================================


@router.post("/{snapshot_id}/topology-archive", response_model=TopologyArchiveResponse)
def store_topology_archive(
    workspace_id: str,
    snapshot_id: str,
    payload: TopologyArchiveRequest,
) -> TopologyArchiveResponse:
    """Store a normalized topology archive for a snapshot.

    The payload should contain nodes and edges from a topology capture.
    Data is normalized (sorted, UI state stripped, canonical JSON) and
    a deterministic SHA-256 hash is computed for quick equality checks.
    """
    try:
        normalized = normalize_topology(payload.topology.model_dump())
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid topology payload: {exc}") from exc

    # Store in repository
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

    return TopologyArchiveResponse(
        snapshot_id=snapshot_id,
        workspace_id=workspace_id,
        topology_hash=normalized["topology_hash"],
        node_count=normalized["node_count"],
        edge_count=normalized["edge_count"],
        status="stored",
    )


@router.post("/compare/topology", response_model=TopologyDiffResponse)
def compare_topology(
    workspace_id: str,
    payload: SnapshotCompareRequest,
) -> TopologyDiffResponse:
    """Compare topology archives between two snapshots.

    If either snapshot has no archive, returns archive_status=missing
    and falls back to metadata-level comparison.
    """
    from app.repositories.topology_archive import TopologyArchiveRepository

    base_snap = service.get_snapshot(workspace_id, payload.base_snapshot_id)
    target_snap = service.get_snapshot(workspace_id, payload.target_snapshot_id)

    base_archive = TopologyArchiveRepository.get(
        payload.base_snapshot_id, workspace_id
    )
    target_archive = TopologyArchiveRepository.get(
        payload.target_snapshot_id, workspace_id
    )

    if base_archive is None or target_archive is None:
        # Fallback: return metadata comparison
        meta = service.compare_snapshots(workspace_id, payload.base_snapshot_id, payload.target_snapshot_id)
        return TopologyDiffResponse(
            ok=False,
            workspace_id=workspace_id,
            base_snapshot_id=payload.base_snapshot_id,
            target_snapshot_id=payload.target_snapshot_id,
            archive_status="missing",
            node_delta={"added": [], "removed": [], "changed": []},
            edge_delta={"added": [], "removed": [], "changed": []},
            summary=["Topology archive not available for one or both snapshots"],
            metadata_delta=meta.model_dump() if hasattr(meta, "model_dump") else meta,
        )

    # Compute topology diff
    diff = topology_diff(base_archive, target_archive)

    return TopologyDiffResponse(
        ok=True,
        workspace_id=workspace_id,
        base_snapshot_id=payload.base_snapshot_id,
        target_snapshot_id=payload.target_snapshot_id,
        archive_status="available",
        node_delta=diff["node_delta"],
        edge_delta=diff["edge_delta"],
        summary=diff["summary"],
    )
