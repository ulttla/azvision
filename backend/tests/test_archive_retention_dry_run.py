from __future__ import annotations

import json
import sqlite3
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

import pytest

SCRIPTS_DIR = Path(__file__).resolve().parents[2] / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from archive_retention_dry_run import select_retention_candidates  # noqa: E402


def _create_retention_db(path: Path) -> None:
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
        conn.executemany(
            "INSERT INTO snapshots (id, workspace_id, name, is_pinned, archived_at) VALUES (?, ?, ?, ?, ?)",
            [
                ("snap_recent_1", "ws-test", "recent 1", 0, ""),
                ("snap_recent_2", "ws-test", "recent 2", 0, ""),
                ("snap_pinned_old", "ws-test", "pinned old", 1, ""),
                ("snap_archived_old", "ws-test", "archived old", 0, "2026-01-01T00:00:00+00:00"),
                ("snap_candidate_1", "ws-test", "candidate 1", 0, ""),
                ("snap_candidate_2", "ws-test", "candidate 2", 0, ""),
                ("snap_too_new", "ws-test", "too new", 0, ""),
                ("snap_other_workspace", "ws-other", "other workspace", 0, ""),
            ],
        )
        conn.executemany(
            """
            INSERT INTO snapshot_topology_archives (
                snapshot_id, workspace_id, topology_hash, nodes_json, edges_json, created_at
            ) VALUES (?, ?, 'hash', ?, ?, ?)
            """,
            [
                ("snap_recent_1", "ws-test", "[1]", "[]", "2026-04-01T00:00:00+00:00"),
                ("snap_recent_2", "ws-test", "[2]", "[]", "2026-03-01T00:00:00+00:00"),
                ("snap_too_new", "ws-test", "[3]", "[]", "2026-02-15T00:00:00+00:00"),
                ("snap_pinned_old", "ws-test", "[4]", "[]", "2025-12-01T00:00:00+00:00"),
                ("snap_archived_old", "ws-test", "[5]", "[]", "2025-11-01T00:00:00+00:00"),
                ("snap_candidate_1", "ws-test", "[6]", "[]", "2025-10-01T00:00:00+00:00"),
                ("snap_candidate_2", "ws-test", "[7]", "[]", "2025-09-01T00:00:00+00:00"),
                ("snap_orphan_old", "ws-test", "[8]", "[]", "2025-08-01T00:00:00+00:00"),
                ("snap_other_workspace", "ws-other", "[9]", "[]", "2025-01-01T00:00:00+00:00"),
            ],
        )
        conn.commit()


def test_select_retention_candidates_protects_guard_categories(tmp_path: Path) -> None:
    db_path = tmp_path / "retention.db"
    _create_retention_db(db_path)

    result = select_retention_candidates(
        db_path,
        workspace_id="ws-test",
        keep_recent=2,
        min_age_days=90,
        now=datetime(2026, 4, 29, tzinfo=timezone.utc),
    )

    assert result["dry_run"] is True
    assert result["archive_count"] == 8
    assert result["candidate_snapshot_ids"] == ["snap_candidate_1", "snap_candidate_2"]
    assert result["candidate_count"] == 2
    assert result["estimated_freed_bytes"] == 10
    assert result["protected_counts"] == {
        "recent_floor": 2,
        "pinned": 1,
        "archived": 1,
        "orphan": 1,
        "too_new": 1,
    }
    assert result["protected_snapshot_ids"]["recent_floor"] == ["snap_recent_1", "snap_recent_2"]
    assert result["protected_snapshot_ids"]["orphan"] == ["snap_orphan_old"]
    assert "snap_other_workspace" not in result["candidate_snapshot_ids"]
    assert all(item["archive_age_days"] >= 90 for item in result["candidates"])
    assert any("dry-run-only" in warning for warning in result["warnings"])


def test_select_retention_candidates_validates_safety_thresholds(tmp_path: Path) -> None:
    db_path = tmp_path / "retention.db"
    _create_retention_db(db_path)

    with pytest.raises(ValueError, match="keep_recent"):
        select_retention_candidates(db_path, workspace_id="ws-test", keep_recent=-1)

    with pytest.raises(ValueError, match="min_age_days"):
        select_retention_candidates(db_path, workspace_id="ws-test", min_age_days=-1)


def test_select_retention_candidates_requires_archive_tables(tmp_path: Path) -> None:
    db_path = tmp_path / "empty.db"
    with sqlite3.connect(db_path) as conn:
        conn.execute("CREATE TABLE snapshots (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL)")
        conn.commit()

    with pytest.raises(SystemExit, match="snapshot_topology_archives"):
        select_retention_candidates(db_path, workspace_id="ws-test")


def test_archive_retention_cli_requires_dry_run(tmp_path: Path) -> None:
    db_path = tmp_path / "retention.db"
    _create_retention_db(db_path)

    result = subprocess.run(
        [
            sys.executable,
            str(SCRIPTS_DIR / "archive_retention_dry_run.py"),
            "--db",
            str(db_path),
            "--workspace",
            "ws-test",
        ],
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode != 0
    assert "--dry-run is required" in result.stderr


def test_archive_retention_cli_outputs_json_dry_run(tmp_path: Path) -> None:
    db_path = tmp_path / "retention.db"
    _create_retention_db(db_path)

    result = subprocess.run(
        [
            sys.executable,
            str(SCRIPTS_DIR / "archive_retention_dry_run.py"),
            "--db",
            str(db_path),
            "--workspace",
            "ws-test",
            "--keep-recent",
            "2",
            "--min-age-days",
            "90",
            "--dry-run",
        ],
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0
    body = json.loads(result.stdout)
    assert body["dry_run"] is True
    assert body["workspace_id"] == "ws-test"
    assert body["candidate_snapshot_ids"] == ["snap_candidate_1", "snap_candidate_2"]
    assert body["candidate_count"] == 2
    assert body["protected_counts"]["orphan"] == 1
    assert any("dry-run-only" in warning for warning in body["warnings"])
