from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel


class TopologyPayload(BaseModel):
    """Topology data with nodes and edges."""

    nodes: list[dict[str, Any]]
    edges: list[dict[str, Any]]


class TopologyArchiveRequest(BaseModel):
    """Request body for storing a topology archive."""

    topology: TopologyPayload


class TopologyArchiveResponse(BaseModel):
    """Response after storing a topology archive."""

    snapshot_id: str
    workspace_id: str
    topology_hash: str
    node_count: int
    edge_count: int
    status: Literal["stored", "updated"]


class TopologyDiffNodeDelta(BaseModel):
    added: list[dict[str, Any]]
    removed: list[dict[str, Any]]
    changed: list[dict[str, Any]]


class TopologyDiffEdgeDelta(BaseModel):
    added: list[dict[str, Any]]
    removed: list[dict[str, Any]]
    changed: list[dict[str, Any]]


class TopologyDiffResponse(BaseModel):
    """Response for topology comparison between two snapshots."""

    ok: bool
    workspace_id: str
    base_snapshot_id: str
    target_snapshot_id: str
    archive_status: Literal["available", "missing"]
    node_delta: TopologyDiffNodeDelta
    edge_delta: TopologyDiffEdgeDelta
    summary: list[str]
    metadata_delta: dict[str, Any] | None = None
