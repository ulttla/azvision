#!/usr/bin/env python3
from __future__ import annotations

import sqlite3
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from archive_retention_dry_run import select_retention_candidates


def create_db(path: Path) -> None:
    with sqlite3.connect(path) as conn:
        conn.execute(
            """
            CREATE TABLE snapshots (
                id TEXT PRIMARY KEY,
                workspace_id TEXT NOT NULL,
                name TEXT NOT NULL DEFAULT '',
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
        snapshots = [
            ("snap_recent_1", "ws-test", "recent 1", 0, ""),
            ("snap_recent_2", "ws-test", "recent 2", 0, ""),
            ("snap_recent_3", "ws-test", "recent 3", 0, ""),
            ("snap_pinned_old", "ws-test", "pinned old", 1, ""),
            ("snap_archived_old", "ws-test", "archived old", 0, "2026-01-01T00:00:00+00:00"),
            ("snap_candidate_1", "ws-test", "candidate 1", 0, ""),
            ("snap_candidate_2", "ws-test", "candidate 2", 0, ""),
            ("snap_other_workspace", "ws-other", "other workspace", 0, ""),
        ]
        conn.executemany(
            "INSERT INTO snapshots (id, workspace_id, name, is_pinned, archived_at) VALUES (?, ?, ?, ?, ?)",
            snapshots,
        )
        archives = [
            ("snap_recent_1", "ws-test", "[1]", "[]", "2026-04-01T00:00:00+00:00"),
            ("snap_recent_2", "ws-test", "[2]", "[]", "2026-03-01T00:00:00+00:00"),
            ("snap_recent_3", "ws-test", "[3]", "[]", "2026-02-01T00:00:00+00:00"),
            ("snap_pinned_old", "ws-test", "[4]", "[]", "2025-12-01T00:00:00+00:00"),
            ("snap_archived_old", "ws-test", "[5]", "[]", "2025-11-01T00:00:00+00:00"),
            ("snap_candidate_1", "ws-test", "[6]", "[]", "2025-10-01T00:00:00+00:00"),
            ("snap_candidate_2", "ws-test", "[7]", "[]", "2025-09-01T00:00:00+00:00"),
            ("snap_orphan_old", "ws-test", "[8]", "[]", "2025-08-01T00:00:00+00:00"),
            ("snap_other_workspace", "ws-other", "[9]", "[]", "2025-01-01T00:00:00+00:00"),
        ]
        conn.executemany(
            """
            INSERT INTO snapshot_topology_archives (
                snapshot_id, workspace_id, topology_hash, nodes_json, edges_json, created_at
            ) VALUES (?, ?, 'hash', ?, ?, ?)
            """,
            archives,
        )
        conn.commit()


def main() -> int:
    with tempfile.TemporaryDirectory() as tmp:
        db_path = Path(tmp) / "retention.db"
        create_db(db_path)
        result = select_retention_candidates(
            db_path,
            workspace_id="ws-test",
            keep_recent=3,
            min_age_days=90,
            now=datetime(2026, 4, 29, tzinfo=timezone.utc),
        )

    assert result["dry_run"] is True
    assert result["archive_count"] == 8
    assert result["candidate_snapshot_ids"] == ["snap_candidate_1", "snap_candidate_2"]
    assert result["candidate_count"] == 2
    assert result["estimated_freed_bytes"] > 0
    assert result["protected_counts"]["recent_floor"] == 3
    assert result["protected_counts"]["pinned"] == 1
    assert result["protected_counts"]["archived"] == 1
    assert result["protected_counts"]["orphan"] == 1
    assert "snap_other_workspace" not in result["candidate_snapshot_ids"]
    print("PASS: archive_retention_dry_run_selftest completed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
