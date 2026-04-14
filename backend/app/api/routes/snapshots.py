from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.schemas.snapshots import SnapshotCreateRequest, SnapshotListResponse, SnapshotRecord, SnapshotUpdateRequest
from app.services.snapshots import SnapshotNotFoundError, SnapshotService

router = APIRouter(prefix="/workspaces/{workspace_id}/snapshots", tags=["snapshots"])
service = SnapshotService()


@router.get("", response_model=SnapshotListResponse)
def list_snapshots(workspace_id: str) -> SnapshotListResponse:
    return SnapshotListResponse(items=service.list_snapshots(workspace_id))


@router.post("", response_model=SnapshotRecord)
def create_snapshot(workspace_id: str, payload: SnapshotCreateRequest) -> SnapshotRecord:
    return service.create_snapshot(workspace_id, payload)


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
