#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sqlite3
from pathlib import Path
from typing import Iterable


DEFAULT_DB_PATHS = (Path("azvision.db"), Path("backend/azvision.db"))


def existing_db_paths(paths: Iterable[Path]) -> list[Path]:
    return [path for path in paths if path.exists()]


def table_exists(conn: sqlite3.Connection, table_name: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
        (table_name,),
    ).fetchone()
    return row is not None


def scalar(conn: sqlite3.Connection, sql: str, params: tuple = ()):
    row = conn.execute(sql, params).fetchone()
    return row[0] if row else None


def check_database(path: Path) -> dict[str, object]:
    with sqlite3.connect(f"file:{path}?mode=ro", uri=True) as conn:
        integrity = scalar(conn, "PRAGMA integrity_check")
        if integrity != "ok":
            raise SystemExit(f"FAIL {path}: integrity_check={integrity}")

        page_count = int(scalar(conn, "PRAGMA page_count") or 0)
        page_size = int(scalar(conn, "PRAGMA page_size") or 0)
        freelist_count = int(scalar(conn, "PRAGMA freelist_count") or 0)
        journal_mode = str(scalar(conn, "PRAGMA journal_mode") or "unknown")

        stats: dict[str, object] = {
            "path": str(path),
            "bytes": path.stat().st_size,
            "integrity_check": integrity,
            "journal_mode": journal_mode,
            "page_count": page_count,
            "page_size": page_size,
            "freelist_count": freelist_count,
            "estimated_page_bytes": page_count * page_size,
        }

        if table_exists(conn, "snapshots"):
            stats["snapshot_count"] = int(scalar(conn, "SELECT COUNT(*) FROM snapshots") or 0)
            stats["snapshot_thumbnail_bytes"] = int(
                scalar(conn, "SELECT COALESCE(SUM(LENGTH(thumbnail_data_url)), 0) FROM snapshots") or 0
            )
            stats["archived_snapshot_count"] = int(
                scalar(conn, "SELECT COUNT(*) FROM snapshots WHERE archived_at IS NOT NULL") or 0
            )

        if table_exists(conn, "manual_nodes"):
            stats["manual_node_count"] = int(scalar(conn, "SELECT COUNT(*) FROM manual_nodes") or 0)
        if table_exists(conn, "manual_edges"):
            stats["manual_edge_count"] = int(scalar(conn, "SELECT COUNT(*) FROM manual_edges") or 0)

        return stats


def main() -> int:
    parser = argparse.ArgumentParser(description="Read-only AzVision SQLite health check")
    parser.add_argument("paths", nargs="*", type=Path, help="SQLite DB paths; defaults to azvision.db and backend/azvision.db")
    args = parser.parse_args()

    paths = existing_db_paths(args.paths or DEFAULT_DB_PATHS)
    if not paths:
        raise SystemExit("FAIL: no SQLite database files found")

    print("== AzVision SQLite health check ==")
    for path in paths:
        stats = check_database(path)
        print(
            "OK {path} bytes={bytes} integrity_check={integrity_check} journal_mode={journal_mode} "
            "pages={page_count} freelist={freelist_count}".format(**stats)
        )
        if "snapshot_count" in stats:
            print(
                "   snapshots={snapshot_count} archived={archived_snapshot_count} thumbnail_bytes={snapshot_thumbnail_bytes}".format(
                    **stats
                )
            )
        if "manual_node_count" in stats or "manual_edge_count" in stats:
            print(
                "   manual_nodes={manual_node_count} manual_edges={manual_edge_count}".format(
                    manual_node_count=stats.get("manual_node_count", 0),
                    manual_edge_count=stats.get("manual_edge_count", 0),
                )
            )
    print("PASS: AzVision SQLite health check completed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
