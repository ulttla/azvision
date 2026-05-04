from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any

from app.core.config import get_settings
from app.db.models import _resolve_sqlite_path

settings = get_settings()


class SimulationRepository:
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
            "simulation_id": row["id"],
            "workspace_id": row["workspace_id"],
            "created_at": row["created_at"],
            "status": row["status"],
            "mode": row["mode"],
            "workload_name": row["workload_name"],
            "environment": row["environment"],
            "description": row["description"],
            "matched_rules": json.loads(row["matched_rules_json"] or "[]"),
            "recommended_resources": json.loads(row["recommended_resources_json"] or "[]"),
            "architecture_notes": json.loads(row["architecture_notes_json"] or "[]"),
            "cost_considerations": json.loads(row["cost_considerations_json"] or "[]"),
            "security_considerations": json.loads(row["security_considerations_json"] or "[]"),
            "next_actions": json.loads(row["next_actions_json"] or "[]"),
            "assumptions": json.loads(row["assumptions_json"] or "[]"),
        }

    def create(self, workspace_id: str, simulation: dict[str, Any]) -> dict[str, Any]:
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO simulations (
                    id,
                    workspace_id,
                    created_at,
                    status,
                    mode,
                    workload_name,
                    environment,
                    description,
                    matched_rules_json,
                    recommended_resources_json,
                    architecture_notes_json,
                    cost_considerations_json,
                    security_considerations_json,
                    next_actions_json,
                    assumptions_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    simulation["simulation_id"],
                    workspace_id,
                    simulation["created_at"],
                    simulation["status"],
                    simulation["mode"],
                    simulation["workload_name"],
                    simulation["environment"],
                    simulation["description"],
                    json.dumps(simulation["matched_rules"]),
                    json.dumps(simulation["recommended_resources"]),
                    json.dumps(simulation["architecture_notes"]),
                    json.dumps(simulation["cost_considerations"]),
                    json.dumps(simulation["security_considerations"]),
                    json.dumps(simulation["next_actions"]),
                    json.dumps(simulation["assumptions"]),
                ),
            )
            connection.commit()

        created = self.get(workspace_id, simulation["simulation_id"])
        if created is None:
            raise RuntimeError("Simulation create verification failed")
        return created

    def list_by_workspace(self, workspace_id: str) -> list[dict[str, Any]]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT *
                FROM simulations
                WHERE workspace_id = ?
                ORDER BY created_at DESC, id DESC
                """,
                (workspace_id,),
            ).fetchall()
        return [self._deserialize_row(row) for row in rows]

    def get(self, workspace_id: str, simulation_id: str) -> dict[str, Any] | None:
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT *
                FROM simulations
                WHERE workspace_id = ? AND id = ?
                LIMIT 1
                """,
                (workspace_id, simulation_id),
            ).fetchone()
        if row is None:
            return None
        return self._deserialize_row(row)

    def delete(self, workspace_id: str, simulation_id: str) -> bool:
        with self._connect() as connection:
            cursor = connection.execute(
                """
                DELETE FROM simulations
                WHERE workspace_id = ? AND id = ?
                """,
                (workspace_id, simulation_id),
            )
            connection.commit()
            return cursor.rowcount > 0
