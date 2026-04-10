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
]


def create_db_and_tables() -> None:
    db_path = _resolve_sqlite_path(settings.database_url)
    db_path.parent.mkdir(parents=True, exist_ok=True)

    with sqlite3.connect(db_path) as conn:
        cursor = conn.cursor()
        for statement in DDL_STATEMENTS:
            cursor.execute(statement)
        conn.commit()
