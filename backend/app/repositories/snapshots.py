from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any, ClassVar

from app.core.config import get_settings
from app.db.models import _resolve_sqlite_path

settings = get_settings()


class SnapshotRepository:
    _ALL_COLUMNS: ClassVar[list[str]] = [
        "id", "workspace_id", "preset_version", "name", "note",
        "compare_refs_json", "cluster_children", "scope", "query_text",
        "selected_subscription_id", "resource_group_name",
        "topology_generated_at", "visible_node_count", "loaded_node_count",
        "edge_count", "thumbnail_data_url", "captured_at", "created_at",
        "updated_at", "last_restored_at", "restore_count", "is_pinned",
        "archived_at",
    ]
    # Columns excluded from list (summary) responses to reduce payload weight.
    _LIST_EXCLUDED_COLUMNS: ClassVar[frozenset[str]] = frozenset({"thumbnail_data_url"})

    @staticmethod
    def _list_select_columns(all_columns: list[str]) -> list[str]:
        columns = [c for c in all_columns if c not in SnapshotRepository._LIST_EXCLUDED_COLUMNS]
        columns.append("CASE WHEN COALESCE(thumbnail_data_url, '') = '' THEN 0 ELSE 1 END AS has_thumbnail")
        return columns

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
    def _deserialize_row(row: sqlite3.Row, *, exclude_thumbnail: bool = False) -> dict[str, Any]:
        row_keys = set(row.keys())
        result: dict[str, Any] = {
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
            "has_thumbnail": bool(row["has_thumbnail"]) if "has_thumbnail" in row_keys else bool(row["thumbnail_data_url"]),
            "captured_at": row["captured_at"] or row["created_at"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
            "last_restored_at": row["last_restored_at"] or "",
            "restore_count": int(row["restore_count"] or 0),
            "is_pinned": bool(row["is_pinned"]),
            "archived_at": row["archived_at"] or "",
        }
        if not exclude_thumbnail:
            result["thumbnail_data_url"] = row["thumbnail_data_url"] or ""
        return result

    def list_by_workspace(
        self,
        workspace_id: str,
        *,
        sort_by: str = "last_restored_at",
        sort_order: str = "desc",
        include_archived: bool = True,
        pinned_first: bool = True,
    ) -> list[dict[str, Any]]:
        safe_sort_by = sort_by if sort_by in {"updated_at", "captured_at", "last_restored_at"} else "last_restored_at"
        safe_sort_order = "ASC" if str(sort_order).lower() == "asc" else "DESC"
        archived_filter_sql = "" if include_archived else " AND COALESCE(archived_at, '') = ''"
        pinned_order_sql = "CASE WHEN is_pinned = 1 THEN 0 ELSE 1 END,\n" if pinned_first else ""
        restore_null_order_sql = (
            "CASE WHEN COALESCE(last_restored_at, '') = '' THEN 1 ELSE 0 END,\n"
            if safe_sort_by == "last_restored_at"
            else ""
        )
        list_columns = ", ".join(self._list_select_columns(self._ALL_COLUMNS))

        with self._connect() as connection:
            rows = connection.execute(
                f"""
                SELECT {list_columns}
                FROM snapshots
                WHERE workspace_id = ?{archived_filter_sql}
                ORDER BY
                    {pinned_order_sql}CASE WHEN COALESCE(archived_at, '') = '' THEN 0 ELSE 1 END,
                    {restore_null_order_sql}{safe_sort_by} {safe_sort_order},
                    captured_at DESC,
                    updated_at DESC,
                    id DESC
                """,
                (workspace_id,),
            ).fetchall()

        return [self._deserialize_row(row, exclude_thumbnail=True) for row in rows]

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
                    captured_at,
                    created_at,
                    updated_at,
                    last_restored_at,
                    restore_count,
                    is_pinned,
                    archived_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                    payload["captured_at"],
                    payload["created_at"],
                    payload["updated_at"],
                    payload["last_restored_at"],
                    payload["restore_count"],
                    1 if payload["is_pinned"] else 0,
                    payload["archived_at"],
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
                    is_pinned = ?,
                    archived_at = ?,
                    updated_at = ?
                WHERE workspace_id = ? AND id = ?
                """,
                (
                    next_record["name"],
                    next_record["note"],
                    1 if next_record["is_pinned"] else 0,
                    next_record["archived_at"],
                    next_record["updated_at"],
                    workspace_id,
                    snapshot_id,
                ),
            )
            connection.commit()

        return self.get(workspace_id, snapshot_id)

    def record_restore(self, workspace_id: str, snapshot_id: str, restored_at: str) -> dict[str, Any] | None:
        current = self.get(workspace_id, snapshot_id)
        if current is None:
            return None

        with self._connect() as connection:
            connection.execute(
                """
                UPDATE snapshots
                SET
                    last_restored_at = ?,
                    restore_count = COALESCE(restore_count, 0) + 1
                WHERE workspace_id = ? AND id = ?
                """,
                (
                    restored_at,
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