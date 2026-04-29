from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any, ClassVar

from app.core.config import get_settings
from app.db.models import _resolve_sqlite_path

settings = get_settings()


class TopologyArchiveRepository:
    """Repository for snapshot_topology_archives table.

    Handles writing normalized topology archives and retrieving them
    for diff comparison. Archives are stored as canonical JSON strings
    with a deterministic hash for quick equality checks.
    """

    @staticmethod
    def _connect(database_url: str | None = None) -> sqlite3.Connection:
        db_url = database_url or settings.database_url
        db_path = _resolve_sqlite_path(db_url)
        db_path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(db_path)
        connection.row_factory = sqlite3.Row
        return connection

    @staticmethod
    def store(
        snapshot_id: str,
        workspace_id: str,
        nodes_json: str,
        edges_json: str,
        topology_hash: str,
        node_count: int,
        edge_count: int,
        *,
        database_url: str | None = None,
    ) -> dict[str, Any]:
        """Store a normalized topology archive for a snapshot."""
        with TopologyArchiveRepository._connect(database_url) as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO snapshot_topology_archives (
                    snapshot_id, workspace_id, archive_version,
                    topology_hash, nodes_json, edges_json,
                    node_count, edge_count, created_at
                ) VALUES (?, ?, 1, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                """,
                (
                    snapshot_id,
                    workspace_id,
                    topology_hash,
                    nodes_json,
                    edges_json,
                    node_count,
                    edge_count,
                ),
            )
            conn.commit()

        return TopologyArchiveRepository.get(snapshot_id, workspace_id) or {}

    @staticmethod
    def get(
        snapshot_id: str,
        workspace_id: str,
        *,
        database_url: str | None = None,
    ) -> dict[str, Any] | None:
        """Retrieve a topology archive by snapshot_id and workspace_id."""
        with TopologyArchiveRepository._connect(database_url) as conn:
            row = conn.execute(
                """
                SELECT snapshot_id, workspace_id, archive_version,
                       topology_hash, nodes_json, edges_json,
                       node_count, edge_count, created_at
                FROM snapshot_topology_archives
                WHERE snapshot_id = ? AND workspace_id = ?
                LIMIT 1
                """,
                (snapshot_id, workspace_id),
            ).fetchone()

        if row is None:
            return None
        return {
            "snapshot_id": row["snapshot_id"],
            "workspace_id": row["workspace_id"],
            "archive_version": int(row["archive_version"] or 1),
            "topology_hash": row["topology_hash"] or "",
            "nodes_json": row["nodes_json"] or "[]",
            "edges_json": row["edges_json"] or "[]",
            "node_count": int(row["node_count"] or 0),
            "edge_count": int(row["edge_count"] or 0),
            "created_at": row["created_at"] or "",
        }

    @staticmethod
    def delete(
        snapshot_id: str,
        workspace_id: str,
        *,
        database_url: str | None = None,
    ) -> bool:
        """Delete a topology archive for a snapshot."""
        with TopologyArchiveRepository._connect(database_url) as conn:
            result = conn.execute(
                "DELETE FROM snapshot_topology_archives WHERE snapshot_id = ? AND workspace_id = ?",
                (snapshot_id, workspace_id),
            )
            conn.commit()
        return result.rowcount > 0

    @staticmethod
    def list_by_workspace(
        workspace_id: str,
        *,
        database_url: str | None = None,
    ) -> list[dict[str, Any]]:
        """List all topology archives for a workspace."""
        with TopologyArchiveRepository._connect(database_url) as conn:
            rows = conn.execute(
                """
                SELECT snapshot_id, workspace_id, archive_version,
                       topology_hash, node_count, edge_count, created_at
                FROM snapshot_topology_archives
                WHERE workspace_id = ?
                ORDER BY created_at DESC
                """,
                (workspace_id,),
            ).fetchall()
        return [
            {
                "snapshot_id": row["snapshot_id"],
                "workspace_id": row["workspace_id"],
                "archive_version": int(row["archive_version"] or 1),
                "topology_hash": row["topology_hash"] or "",
                "node_count": int(row["node_count"] or 0),
                "edge_count": int(row["edge_count"] or 0),
                "created_at": row["created_at"] or "",
            }
            for row in rows
        ]

    @staticmethod
    def count_by_workspace(
        workspace_id: str,
        *,
        database_url: str | None = None,
    ) -> int:
        """Count archives for a workspace."""
        with TopologyArchiveRepository._connect(database_url) as conn:
            row = conn.execute(
                "SELECT COUNT(*) as cnt FROM snapshot_topology_archives WHERE workspace_id = ?",
                (workspace_id,),
            ).fetchone()
        return int(row["cnt"]) if row else 0

    @staticmethod
    def total_size_bytes(
        workspace_id: str,
        *,
        database_url: str | None = None,
    ) -> int:
        """Total size of all archive JSON payloads for a workspace."""
        with TopologyArchiveRepository._connect(database_url) as conn:
            row = conn.execute(
                """
                SELECT COALESCE(SUM(LENGTH(nodes_json) + LENGTH(edges_json)), 0) as total
                FROM snapshot_topology_archives
                WHERE workspace_id = ?
                """,
                (workspace_id,),
            ).fetchone()
        return int(row["total"]) if row else 0
