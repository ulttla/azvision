from __future__ import annotations

import sqlite3
from pathlib import Path

from app.core.config import get_settings

settings = get_settings()


def _resolve_sqlite_path(database_url: str) -> Path:
    prefix = "sqlite:///"
    if not database_url.startswith(prefix):
        raise ValueError(f"Only sqlite URLs are supported in Sprint 0: {database_url}")

    raw_path = database_url[len(prefix):]
    return Path(raw_path).expanduser().resolve()


DDL_STATEMENTS = [
    """
    CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        company_name TEXT,
        description TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS credential_profiles (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        auth_type TEXT NOT NULL,
        metadata_json TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS scan_runs (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        status TEXT NOT NULL,
        scope TEXT,
        notes TEXT,
        started_at TEXT,
        finished_at TEXT
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS subscriptions (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        subscription_id TEXT NOT NULL,
        display_name TEXT NOT NULL,
        state TEXT,
        tenant_id TEXT
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS resource_groups (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        subscription_id TEXT NOT NULL,
        name TEXT NOT NULL,
        location TEXT,
        tags_json TEXT,
        resource_id TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS resource_nodes (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        subscription_id TEXT NOT NULL,
        resource_group_id TEXT,
        resource_id TEXT NOT NULL,
        resource_type TEXT NOT NULL,
        display_name TEXT NOT NULL,
        location TEXT,
        tags_json TEXT,
        source TEXT NOT NULL DEFAULT 'azure',
        confidence REAL NOT NULL DEFAULT 1.0
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS relationship_edges (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        source_node_key TEXT NOT NULL,
        target_node_key TEXT NOT NULL,
        relation_type TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'azure',
        confidence REAL NOT NULL DEFAULT 1.0,
        notes TEXT
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS manual_nodes (
        id TEXT PRIMARY KEY,
        manual_ref TEXT NOT NULL UNIQUE,
        workspace_id TEXT NOT NULL,
        display_name TEXT NOT NULL,
        manual_type TEXT NOT NULL,
        vendor TEXT,
        environment TEXT,
        notes TEXT,
        source TEXT NOT NULL DEFAULT 'manual',
        confidence REAL NOT NULL DEFAULT 1.0
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS manual_edges (
        id TEXT PRIMARY KEY,
        manual_edge_ref TEXT NOT NULL UNIQUE,
        workspace_id TEXT NOT NULL,
        source_node_key TEXT NOT NULL,
        target_node_key TEXT NOT NULL,
        relation_type TEXT NOT NULL,
        notes TEXT,
        source TEXT NOT NULL DEFAULT 'manual',
        confidence REAL NOT NULL DEFAULT 1.0
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS snapshots (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        preset_version INTEGER NOT NULL DEFAULT 1,
        name TEXT NOT NULL,
        note TEXT,
        compare_refs_json TEXT NOT NULL,
        cluster_children INTEGER NOT NULL DEFAULT 1,
        scope TEXT NOT NULL,
        query_text TEXT NOT NULL DEFAULT '',
        selected_subscription_id TEXT NOT NULL DEFAULT '',
        resource_group_name TEXT NOT NULL DEFAULT '',
        topology_generated_at TEXT,
        visible_node_count INTEGER NOT NULL DEFAULT 0,
        loaded_node_count INTEGER NOT NULL DEFAULT 0,
        edge_count INTEGER NOT NULL DEFAULT 0,
        thumbnail_data_url TEXT,
        captured_at TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_restored_at TEXT,
        restore_count INTEGER NOT NULL DEFAULT 0,
        is_pinned INTEGER NOT NULL DEFAULT 0,
        archived_at TEXT
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_snapshots_workspace_updated_at
    ON snapshots (workspace_id, updated_at DESC, created_at DESC)
    """,
    """
    CREATE TABLE IF NOT EXISTS simulations (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        status TEXT NOT NULL,
        mode TEXT NOT NULL,
        workload_name TEXT NOT NULL,
        environment TEXT NOT NULL,
        description TEXT NOT NULL,
        matched_rules_json TEXT NOT NULL DEFAULT '[]',
        recommended_resources_json TEXT NOT NULL DEFAULT '[]',
        architecture_notes_json TEXT NOT NULL DEFAULT '[]',
        cost_considerations_json TEXT NOT NULL DEFAULT '[]',
        security_considerations_json TEXT NOT NULL DEFAULT '[]',
        next_actions_json TEXT NOT NULL DEFAULT '[]',
        assumptions_json TEXT NOT NULL DEFAULT '[]'
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_simulations_workspace_created_at
    ON simulations (workspace_id, created_at DESC, id DESC)
    """,
    """
    CREATE TABLE IF NOT EXISTS snapshot_topology_archives (
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
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_topology_archives_workspace
    ON snapshot_topology_archives (workspace_id, snapshot_id)
    """,
]


def _ensure_column(
    cursor: sqlite3.Cursor,
    table_name: str,
    column_name: str,
    column_sql: str,
) -> None:
    rows = cursor.execute(f"PRAGMA table_info({table_name})").fetchall()
    existing_columns = {row[1] for row in rows}
    if column_name in existing_columns:
        return

    cursor.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_sql}")


def create_db_and_tables() -> None:
    db_path = _resolve_sqlite_path(settings.database_url)
    db_path.parent.mkdir(parents=True, exist_ok=True)

    with sqlite3.connect(db_path) as conn:
        cursor = conn.cursor()
        for statement in DDL_STATEMENTS:
            cursor.execute(statement)

        _ensure_column(
            cursor,
            "snapshots",
            "selected_subscription_id",
            "selected_subscription_id TEXT NOT NULL DEFAULT ''",
        )
        _ensure_column(
            cursor,
            "snapshots",
            "captured_at",
            "captured_at TEXT NOT NULL DEFAULT ''",
        )
        _ensure_column(
            cursor,
            "snapshots",
            "last_restored_at",
            "last_restored_at TEXT",
        )
        _ensure_column(
            cursor,
            "snapshots",
            "restore_count",
            "restore_count INTEGER NOT NULL DEFAULT 0",
        )
        _ensure_column(
            cursor,
            "snapshots",
            "is_pinned",
            "is_pinned INTEGER NOT NULL DEFAULT 0",
        )
        _ensure_column(
            cursor,
            "snapshots",
            "archived_at",
            "archived_at TEXT",
        )
        _ensure_column(
            cursor,
            "simulations",
            "architecture_notes_json",
            "architecture_notes_json TEXT NOT NULL DEFAULT '[]'",
        )
        _ensure_column(
            cursor,
            "simulations",
            "cost_considerations_json",
            "cost_considerations_json TEXT NOT NULL DEFAULT '[]'",
        )
        _ensure_column(
            cursor,
            "simulations",
            "security_considerations_json",
            "security_considerations_json TEXT NOT NULL DEFAULT '[]'",
        )
        _ensure_column(
            cursor,
            "simulations",
            "next_actions_json",
            "next_actions_json TEXT NOT NULL DEFAULT '[]'",
        )

        cursor.execute(
            """
            UPDATE snapshots
            SET captured_at = COALESCE(NULLIF(captured_at, ''), created_at)
            WHERE COALESCE(captured_at, '') = ''
            """
        )
        conn.commit()
