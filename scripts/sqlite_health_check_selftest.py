#!/usr/bin/env python3
from __future__ import annotations

import sqlite3
import tempfile
from pathlib import Path

from sqlite_health_check import check_database


def create_db(path: Path) -> None:
    with sqlite3.connect(path) as conn:
        conn.execute(
            """
            CREATE TABLE snapshots (
                id TEXT PRIMARY KEY,
                workspace_id TEXT NOT NULL,
                thumbnail_data_url TEXT,
                is_pinned INTEGER NOT NULL DEFAULT 0,
                archived_at TEXT
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE snapshot_topology_archives (
                snapshot_id TEXT PRIMARY KEY,
                workspace_id TEXT NOT NULL,
                archive_version INTEGER NOT NULL DEFAULT 1,
                topology_hash TEXT NOT NULL,
                nodes_json TEXT NOT NULL,
                edges_json TEXT NOT NULL,
                node_count INTEGER NOT NULL DEFAULT 0,
                edge_count INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.execute(
            """
            INSERT INTO snapshot_topology_archives (
                snapshot_id, workspace_id, topology_hash, nodes_json, edges_json, created_at
            ) VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                "snap_orphan_old",
                "ws-test",
                "hash-old",
                "[]",
                "[]",
                "2025-01-01 00:00:00",
            ),
        )
        conn.commit()


def main() -> int:
    with tempfile.TemporaryDirectory() as tmp:
        db_path = Path(tmp) / "health.db"
        create_db(db_path)
        stats = check_database(db_path)

    assert stats["archive_count"] == 1
    assert stats["orphan_archive_count"] == 1
    assert int(stats["oldest_archive_age_days"]) > 90
    warnings = set(stats["archive_warnings"])
    assert "orphan_archives_present" in warnings
    assert "oldest_archive_age_gt_90d" in warnings
    print("PASS: sqlite_health_check_selftest completed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
