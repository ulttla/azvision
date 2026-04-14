from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any

from app.core.config import get_settings
from app.db.models import _resolve_sqlite_path

settings = get_settings()


class SnapshotRepository:
    def __init__(self, database_url: str | None = None):
        self.database_url = database_url or settings.database_url

    def _db_path(self) -> Path:
        return _resolve_sqlite_path(self.database_url)

    def _connect(self) -> sqlite3.Connection:
        db_path = self._db_path()
        db_path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(db_path)
        connection.row_factory = sqlite3.Row
        return connection

    @staticmethod
    def _deserialize_row(row: sqlite3.Row) -> dict[str, Any]:
        return {
            "id": row["id"],
            "workspace_id": row["workspace_id"],
            "preset_version": int(row["preset_version"] or 1),
            "name": row["name"],
            "note": row["note"] or "",
            "compare_refs": json.loads(row["compare_refs_json"] or "[]"),
            "cluster_children": bool(row["cluster_children"]),
            "scope": row["scope"] or "visible",
            "query": row["query_text"] or "",
            "selected_subscription_id": row["selected_subscription_id"] or "",
            "resource_group_name": row["resource_group_name"] or "",
            "topology_generated_at": row["topology_generated_at"] or "",
            "visible_node_count": int(row["visible_node_count"] or 0),
            "loaded_node_count": int(row["loaded_node_count"] or 0),
            "edge_count": int(row["edge_count"] or 0),
            "thumbnail_data_url": row["thumbnail_data_url"] or "",
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }

    def list_by_workspace(self, workspace_id: str) -> list[dict[str, Any]]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT *
                FROM snapshots
                WHERE workspace_id = ?
                ORDER BY updated_at DESC, created_at DESC, id DESC
                """,
                (workspace_id,),
            ).fetchall()

        return [self._deserialize_row(row) for row in rows]

    def get(self, workspace_id: str, snapshot_id: str) -> dict[str, Any] | None:
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT *
                FROM snapshots
                WHERE workspace_id = ? AND id = ?
                LIMIT 1
                """,
                (workspace_id, snapshot_id),
            ).fetchone()

        if row is None:
            return None
        return self._deserialize_row(row)

    def create(self, payload: dict[str, Any]) -> dict[str, Any]:
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO snapshots (
                    id,
                    workspace_id,
                    preset_version,
                    name,
                    note,
                    compare_refs_json,
                    cluster_children,
                    scope,
                    query_text,
                    selected_subscription_id,
                    resource_group_name,
                    topology_generated_at,
                    visible_node_count,
                    loaded_node_count,
                    edge_count,
                    thumbnail_data_url,
                    created_at,
                    updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    payload["id"],
                    payload["workspace_id"],
                    payload["preset_version"],
                    payload["name"],
                    payload["note"],
                    json.dumps(payload["compare_refs"]),
                    1 if payload["cluster_children"] else 0,
                    payload["scope"],
                    payload["query"],
                    payload["selected_subscription_id"],
                    payload["resource_group_name"],
                    payload["topology_generated_at"],
                    payload["visible_node_count"],
                    payload["loaded_node_count"],
                    payload["edge_count"],
                    payload["thumbnail_data_url"],
                    payload["created_at"],
                    payload["updated_at"],
                ),
            )
            connection.commit()

        created = self.get(payload["workspace_id"], payload["id"])
        if created is None:
            raise RuntimeError("Snapshot create verification failed")
        return created

    def update(self, workspace_id: str, snapshot_id: str, patch: dict[str, Any]) -> dict[str, Any] | None:
        current = self.get(workspace_id, snapshot_id)
        if current is None:
            return None

        next_record = {**current, **patch, "workspace_id": workspace_id, "id": snapshot_id}

        with self._connect() as connection:
            connection.execute(
                """
                UPDATE snapshots
                SET
                    name = ?,
                    note = ?,
                    updated_at = ?
                WHERE workspace_id = ? AND id = ?
                """,
                (
                    next_record["name"],
                    next_record["note"],
                    next_record["updated_at"],
                    workspace_id,
                    snapshot_id,
                ),
            )
            connection.commit()

        return self.get(workspace_id, snapshot_id)

    def delete(self, workspace_id: str, snapshot_id: str) -> bool:
        with self._connect() as connection:
            result = connection.execute(
                "DELETE FROM snapshots WHERE workspace_id = ? AND id = ?",
                (workspace_id, snapshot_id),
            )
            connection.commit()

        return result.rowcount > 0
