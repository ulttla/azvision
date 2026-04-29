#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable


DEFAULT_DB_PATHS = (Path("azvision.db"), Path("backend/azvision.db"))
ARCHIVE_COUNT_WARN_THRESHOLD = 50
ARCHIVE_TOTAL_BYTES_WARN_THRESHOLD = 10 * 1024 * 1024
ARCHIVE_AGE_WARN_DAYS = 90


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


def parse_sqlite_timestamp(value: object) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    text = value.strip().replace("Z", "+00:00")
    candidates = [text]
    if " " in text and "T" not in text:
        candidates.append(text.replace(" ", "T") + "+00:00")
    for candidate in candidates:
        try:
            parsed = datetime.fromisoformat(candidate)
        except ValueError:
            continue
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    return None


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
        if table_exists(conn, "simulations"):
            stats["simulation_count"] = int(scalar(conn, "SELECT COUNT(*) FROM simulations") or 0)
            stats["simulation_json_bytes"] = int(
                scalar(
                    conn,
                    """
                    SELECT COALESCE(SUM(
                        LENGTH(matched_rules_json)
                        + LENGTH(recommended_resources_json)
                        + LENGTH(architecture_notes_json)
                        + LENGTH(cost_considerations_json)
                        + LENGTH(security_considerations_json)
                        + LENGTH(next_actions_json)
                        + LENGTH(assumptions_json)
                    ), 0)
                    FROM simulations
                    """,
                )
                or 0
            )

        if table_exists(conn, "snapshot_topology_archives"):
            stats["archive_count"] = int(scalar(conn, "SELECT COUNT(*) FROM snapshot_topology_archives") or 0)
            stats["archive_total_bytes"] = int(
                scalar(
                    conn,
                    """
                    SELECT COALESCE(SUM(LENGTH(nodes_json) + LENGTH(edges_json)), 0)
                    FROM snapshot_topology_archives
                    """,
                )
                or 0
            )
            oldest_archive_created_at = scalar(conn, "SELECT MIN(created_at) FROM snapshot_topology_archives")
            if oldest_archive_created_at:
                stats["oldest_archive_created_at"] = str(oldest_archive_created_at)
                parsed_oldest = parse_sqlite_timestamp(oldest_archive_created_at)
                if parsed_oldest is not None:
                    stats["oldest_archive_age_days"] = int(
                        (datetime.now(timezone.utc) - parsed_oldest).total_seconds() // 86400
                    )
            if table_exists(conn, "snapshots"):
                stats["orphan_archive_count"] = int(
                    scalar(
                        conn,
                        """
                        SELECT COUNT(*)
                        FROM snapshot_topology_archives a
                        LEFT JOIN snapshots s
                          ON s.id = a.snapshot_id AND s.workspace_id = a.workspace_id
                        WHERE s.id IS NULL
                        """,
                    )
                    or 0
                )

            archive_warnings: list[str] = []
            if int(stats["archive_count"]) > ARCHIVE_COUNT_WARN_THRESHOLD:
                archive_warnings.append("archive_count_gt_50")
            if int(stats["archive_total_bytes"]) > ARCHIVE_TOTAL_BYTES_WARN_THRESHOLD:
                archive_warnings.append("archive_total_bytes_gt_10mb")
            if int(stats.get("oldest_archive_age_days", 0)) > ARCHIVE_AGE_WARN_DAYS:
                archive_warnings.append("oldest_archive_age_gt_90d")
            if int(stats.get("orphan_archive_count", 0)) > 0:
                archive_warnings.append("orphan_archives_present")
            if archive_warnings:
                stats["archive_warnings"] = archive_warnings

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
        if "simulation_count" in stats:
            print(
                "   simulations={simulation_count} simulation_json_bytes={simulation_json_bytes}".format(**stats)
            )
        if "archive_count" in stats:
            archive_line = "   topology_archives={archive_count} archive_total_bytes={archive_total_bytes}".format(**stats)
            if "oldest_archive_age_days" in stats:
                archive_line += " oldest_archive_age_days={oldest_archive_age_days}".format(**stats)
            if "orphan_archive_count" in stats:
                archive_line += " orphan_archives={orphan_archive_count}".format(**stats)
            print(archive_line)
            if stats.get("archive_warnings"):
                print("   archive_warnings=" + ",".join(stats["archive_warnings"]))
    print("PASS: AzVision SQLite health check completed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
