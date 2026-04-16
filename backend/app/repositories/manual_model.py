from __future__ import annotations

import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.core.config import get_settings
from app.db.models import _resolve_sqlite_path

settings = get_settings()


class ManualModelRepository:
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

    # ── Manual Nodes ──────────────────────────────────────────────

    def list_manual_nodes(self, workspace_id: str) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM manual_nodes WHERE workspace_id = ? ORDER BY display_name",
                (workspace_id,),
            ).fetchall()
        return [self._deserialize_manual_node(row) for row in rows]

    def get_manual_node(self, workspace_id: str, manual_ref: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM manual_nodes WHERE workspace_id = ? AND manual_ref = ?",
                (workspace_id, manual_ref),
            ).fetchone()
        if row is None:
            return None
        return self._deserialize_manual_node(row)

    def create_manual_node(self, workspace_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        manual_ref = payload.get("manual_ref") or f"mn_{uuid.uuid4().hex[:10]}"
        now = datetime.now(timezone.utc).isoformat()
        row_id = str(uuid.uuid4())

        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO manual_nodes (id, manual_ref, workspace_id, display_name, manual_type, vendor, environment, notes, source, confidence)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    row_id,
                    manual_ref,
                    workspace_id,
                    payload.get("display_name", "Manual Node"),
                    payload.get("manual_type", "external-system"),
                    payload.get("vendor"),
                    payload.get("environment"),
                    payload.get("notes"),
                    "manual",
                    payload.get("confidence", 1.0),
                ),
            )
            conn.commit()

        created = self.get_manual_node(workspace_id, manual_ref)
        if created is None:
            raise RuntimeError("Manual node create verification failed")
        return created

    def update_manual_node(self, workspace_id: str, manual_ref: str, patch: dict[str, Any]) -> dict[str, Any] | None:
        current = self.get_manual_node(workspace_id, manual_ref)
        if current is None:
            return None

        merged = {**current, **{k: v for k, v in patch.items() if k in ("display_name", "manual_type", "vendor", "environment", "notes", "confidence")}}

        with self._connect() as conn:
            conn.execute(
                """
                UPDATE manual_nodes
                SET display_name = ?, manual_type = ?, vendor = ?, environment = ?, notes = ?, confidence = ?
                WHERE workspace_id = ? AND manual_ref = ?
                """,
                (
                    merged["display_name"],
                    merged["manual_type"],
                    merged.get("vendor"),
                    merged.get("environment"),
                    merged.get("notes"),
                    merged.get("confidence", 1.0),
                    workspace_id,
                    manual_ref,
                ),
            )
            conn.commit()

        return self.get_manual_node(workspace_id, manual_ref)

    def delete_manual_node(self, workspace_id: str, manual_ref: str) -> bool:
        # Also delete edges referencing this node
        with self._connect() as conn:
            conn.execute(
                "DELETE FROM manual_edges WHERE workspace_id = ? AND (source_node_key = ? OR target_node_key = ?)",
                (workspace_id, f"manual:{manual_ref}", f"manual:{manual_ref}"),
            )
            result = conn.execute(
                "DELETE FROM manual_nodes WHERE workspace_id = ? AND manual_ref = ?",
                (workspace_id, manual_ref),
            )
            conn.commit()
        return result.rowcount > 0

    # ── Manual Edges ──────────────────────────────────────────────

    def list_manual_edges(self, workspace_id: str) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM manual_edges WHERE workspace_id = ? ORDER BY source_node_key, relation_type, target_node_key",
                (workspace_id,),
            ).fetchall()
        return [self._deserialize_manual_edge(row) for row in rows]

    def get_manual_edge(self, workspace_id: str, manual_edge_ref: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM manual_edges WHERE workspace_id = ? AND manual_edge_ref = ?",
                (workspace_id, manual_edge_ref),
            ).fetchone()
        if row is None:
            return None
        return self._deserialize_manual_edge(row)

    def create_manual_edge(self, workspace_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        manual_edge_ref = payload.get("manual_edge_ref") or f"me_{uuid.uuid4().hex[:10]}"
        row_id = str(uuid.uuid4())

        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO manual_edges (id, manual_edge_ref, workspace_id, source_node_key, target_node_key, relation_type, notes, source, confidence)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    row_id,
                    manual_edge_ref,
                    workspace_id,
                    payload.get("source_node_key", ""),
                    payload.get("target_node_key", ""),
                    payload.get("relation_type", "connects_to"),
                    payload.get("notes"),
                    "manual",
                    payload.get("confidence", 1.0),
                ),
            )
            conn.commit()

        created = self.get_manual_edge(workspace_id, manual_edge_ref)
        if created is None:
            raise RuntimeError("Manual edge create verification failed")
        return created

    def update_manual_edge(self, workspace_id: str, manual_edge_ref: str, patch: dict[str, Any]) -> dict[str, Any] | None:
        current = self.get_manual_edge(workspace_id, manual_edge_ref)
        if current is None:
            return None

        merged = {**current, **{k: v for k, v in patch.items() if k in ("source_node_key", "target_node_key", "relation_type", "notes", "confidence")}}

        with self._connect() as conn:
            conn.execute(
                """
                UPDATE manual_edges
                SET source_node_key = ?, target_node_key = ?, relation_type = ?, notes = ?, confidence = ?
                WHERE workspace_id = ? AND manual_edge_ref = ?
                """,
                (
                    merged.get("source_node_key", ""),
                    merged.get("target_node_key", ""),
                    merged.get("relation_type", "connects_to"),
                    merged.get("notes"),
                    merged.get("confidence", 1.0),
                    workspace_id,
                    manual_edge_ref,
                ),
            )
            conn.commit()

        return self.get_manual_edge(workspace_id, manual_edge_ref)

    def delete_manual_edge(self, workspace_id: str, manual_edge_ref: str) -> bool:
        with self._connect() as conn:
            result = conn.execute(
                "DELETE FROM manual_edges WHERE workspace_id = ? AND manual_edge_ref = ?",
                (workspace_id, manual_edge_ref),
            )
            conn.commit()
        return result.rowcount > 0

    # ── Helpers for topology merge ─────────────────────────────────

    def get_manual_nodes_as_topology_nodes(self, workspace_id: str) -> list[dict[str, Any]]:
        rows = self.list_manual_nodes(workspace_id)
        return [
            {
                "node_key": f"manual:{r['manual_ref']}",
                "node_type": "manual",
                "node_ref": r["manual_ref"],
                "display_name": r["display_name"],
                "source": "manual",
                "confidence": r.get("confidence", 1.0),
                "manual_type": r.get("manual_type"),
                "vendor": r.get("vendor"),
                "environment": r.get("environment"),
                "notes": r.get("notes"),
            }
            for r in rows
        ]

    def get_manual_edges_as_topology_edges(self, workspace_id: str) -> list[dict[str, Any]]:
        rows = self.list_manual_edges(workspace_id)
        return [
            {
                "source_node_key": r["source_node_key"],
                "target_node_key": r["target_node_key"],
                "relation_type": r["relation_type"],
                "source": "manual",
                "confidence": r.get("confidence", 1.0),
                "relation_category": _relation_category(r["relation_type"]),
            }
            for r in rows
        ]

    # ── Deserialization ────────────────────────────────────────────

    @staticmethod
    def _deserialize_manual_node(row: sqlite3.Row) -> dict[str, Any]:
        return {
            "id": row["id"],
            "manual_ref": row["manual_ref"],
            "workspace_id": row["workspace_id"],
            "display_name": row["display_name"],
            "manual_type": row["manual_type"],
            "vendor": row["vendor"],
            "environment": row["environment"],
            "notes": row["notes"],
            "source": row["source"],
            "confidence": row["confidence"],
        }

    @staticmethod
    def _deserialize_manual_edge(row: sqlite3.Row) -> dict[str, Any]:
        return {
            "id": row["id"],
            "manual_edge_ref": row["manual_edge_ref"],
            "workspace_id": row["workspace_id"],
            "source_node_key": row["source_node_key"],
            "target_node_key": row["target_node_key"],
            "relation_type": row["relation_type"],
            "notes": row["notes"],
            "source": row["source"],
            "confidence": row["confidence"],
        }


def _relation_category(relation_type: str) -> str:
    if relation_type in {"contains", "manages"}:
        return "structural"
    if relation_type in {"connects_to", "secures", "routes"}:
        return "network"
    return "other"