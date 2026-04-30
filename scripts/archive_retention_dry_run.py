#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlite_health_check import parse_sqlite_timestamp, table_exists

DEFAULT_DB_PATH = Path("backend/azvision.db")
DEFAULT_KEEP_RECENT = 5
DEFAULT_MIN_AGE_DAYS = 90


def _archive_age_days(created_at: object, *, now: datetime) -> int | None:
    parsed = parse_sqlite_timestamp(created_at)
    if parsed is None:
        return None
    return int((now - parsed).total_seconds() // 86400)


def select_retention_candidates(
    db_path: Path,
    *,
    workspace_id: str,
    keep_recent: int = DEFAULT_KEEP_RECENT,
    min_age_days: int = DEFAULT_MIN_AGE_DAYS,
    now: datetime | None = None,
) -> dict[str, Any]:
    """Select dry-run-only topology archive retention candidates.

    This function never mutates SQLite. It only returns candidate metadata for
    explicit review. Pinned snapshots, archived snapshots, orphan archives, and
    the newest keep_recent archives in the workspace are always protected.
    """
    if keep_recent < 0:
        raise ValueError("keep_recent must be >= 0")
    if min_age_days < 0:
        raise ValueError("min_age_days must be >= 0")

    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    now = now.astimezone(timezone.utc)

    with sqlite3.connect(f"file:{db_path}?mode=ro", uri=True) as conn:
        conn.row_factory = sqlite3.Row
        if not table_exists(conn, "snapshot_topology_archives"):
            raise SystemExit(f"FAIL {db_path}: snapshot_topology_archives table not found")
        if not table_exists(conn, "snapshots"):
            raise SystemExit(f"FAIL {db_path}: snapshots table not found")

        rows = conn.execute(
            """
            SELECT
                a.snapshot_id,
                a.workspace_id,
                a.created_at AS archive_created_at,
                LENGTH(a.nodes_json) + LENGTH(a.edges_json) AS archive_bytes,
                s.id AS snapshot_exists,
                COALESCE(s.is_pinned, 0) AS is_pinned,
                COALESCE(s.archived_at, '') AS archived_at,
                COALESCE(s.name, '') AS snapshot_name
            FROM snapshot_topology_archives a
            LEFT JOIN snapshots s
              ON s.id = a.snapshot_id AND s.workspace_id = a.workspace_id
            WHERE a.workspace_id = ?
            ORDER BY a.created_at DESC, a.snapshot_id DESC
            """,
            (workspace_id,),
        ).fetchall()

    candidates: list[dict[str, Any]] = []
    protected_counts = {
        "recent_floor": 0,
        "pinned": 0,
        "archived": 0,
        "orphan": 0,
        "too_new": 0,
    }
    protected_snapshot_ids: dict[str, list[str]] = {key: [] for key in protected_counts}

    for index, row in enumerate(rows):
        snapshot_id = str(row["snapshot_id"])
        age_days = _archive_age_days(row["archive_created_at"], now=now)
        archive_bytes = int(row["archive_bytes"] or 0)

        protection_reason: str | None = None
        if row["snapshot_exists"] is None:
            protection_reason = "orphan"
        elif index < keep_recent:
            protection_reason = "recent_floor"
        elif int(row["is_pinned"] or 0) == 1:
            protection_reason = "pinned"
        elif str(row["archived_at"] or "") != "":
            protection_reason = "archived"
        elif age_days is None or age_days < min_age_days:
            protection_reason = "too_new"

        if protection_reason:
            protected_counts[protection_reason] += 1
            protected_snapshot_ids[protection_reason].append(snapshot_id)
            continue

        candidates.append(
            {
                "snapshot_id": snapshot_id,
                "snapshot_name": str(row["snapshot_name"] or ""),
                "archive_created_at": str(row["archive_created_at"] or ""),
                "archive_age_days": age_days,
                "archive_bytes": archive_bytes,
                "reason": f"unpinned active archive older than {min_age_days} days and outside newest {keep_recent}",
            }
        )

    return {
        "workspace_id": workspace_id,
        "dry_run": True,
        "database_path": str(db_path),
        "keep_recent": keep_recent,
        "min_age_days": min_age_days,
        "archive_count": len(rows),
        "candidate_count": len(candidates),
        "candidate_snapshot_ids": [item["snapshot_id"] for item in candidates],
        "estimated_freed_bytes": sum(int(item["archive_bytes"]) for item in candidates),
        "candidates": candidates,
        "protected_counts": protected_counts,
        "protected_snapshot_ids": protected_snapshot_ids,
        "warnings": [
            "dry-run-only: this script does not delete archives",
            "review candidates before any future explicit prune implementation",
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Dry-run-only AzVision topology archive retention candidate selector")
    parser.add_argument("--db", type=Path, default=DEFAULT_DB_PATH, help="SQLite database path")
    parser.add_argument("--workspace", required=True, help="Workspace ID to inspect")
    parser.add_argument("--keep-recent", type=int, default=DEFAULT_KEEP_RECENT, help="Newest archives to always protect")
    parser.add_argument("--min-age-days", type=int, default=DEFAULT_MIN_AGE_DAYS, help="Minimum archive age for eligibility")
    parser.add_argument("--dry-run", action="store_true", help="Required safety flag; no write mode exists")
    args = parser.parse_args()

    if not args.dry_run:
        raise SystemExit("FAIL: --dry-run is required; this script has no write mode")
    if not args.db.exists():
        raise SystemExit(f"FAIL: database not found: {args.db}")

    result = select_retention_candidates(
        args.db,
        workspace_id=args.workspace,
        keep_recent=args.keep_recent,
        min_age_days=args.min_age_days,
    )
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
