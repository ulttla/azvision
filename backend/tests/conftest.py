"""Shared pytest fixtures for AzVision backend tests.

Strategy:
- Each test function gets an isolated SQLite database in a temp directory.
- The snapshot route module-level service singleton is monkeypatched to use
  the test DB for every test that uses the `client` fixture.
- The manual model repository module-level `settings` is also patched so that
  `_manual_repo()` in topology routes resolves the correct DB.
- `get_settings` lru_cache is cleared and env vars are set so topology route
  handlers calling `get_settings()` get test settings.
"""
from __future__ import annotations

import os
import sqlite3
from pathlib import Path
from typing import Generator

import pytest
from fastapi.testclient import TestClient


# ---------------------------------------------------------------------------
# Database helpers
# ---------------------------------------------------------------------------

def _create_test_db(db_path: Path) -> None:
    """Create and migrate a fresh SQLite database at ``db_path``."""
    from app.db.models import DDL_STATEMENTS

    with sqlite3.connect(str(db_path)) as conn:
        cursor = conn.cursor()
        for stmt in DDL_STATEMENTS:
            cursor.execute(stmt)
        # Run the same backfill migration as production startup
        cursor.execute(
            "UPDATE snapshots "
            "SET captured_at = COALESCE(NULLIF(captured_at, ''), created_at) "
            "WHERE COALESCE(captured_at, '') = ''"
        )
        conn.commit()


# ---------------------------------------------------------------------------
# Core fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def db_path(tmp_path: Path) -> Path:
    """Isolated, migrated SQLite database path for one test."""
    p = tmp_path / "azvision_test.db"
    _create_test_db(p)
    return p


@pytest.fixture
def db_url(db_path: Path) -> str:
    return f"sqlite:///{db_path}"


# ---------------------------------------------------------------------------
# Service / repository fixtures (no HTTP layer)
# ---------------------------------------------------------------------------

@pytest.fixture
def snapshot_repo(db_url: str):
    from app.repositories.snapshots import SnapshotRepository
    return SnapshotRepository(database_url=db_url)


@pytest.fixture
def snapshot_service(snapshot_repo):
    from app.services.snapshots import SnapshotService
    return SnapshotService(repository=snapshot_repo)


@pytest.fixture
def manual_repo(db_url: str):
    from app.repositories.manual_model import ManualModelRepository
    return ManualModelRepository(database_url=db_url)


# ---------------------------------------------------------------------------
# HTTP-level test client
# ---------------------------------------------------------------------------

@pytest.fixture
def client(
    db_url: str,
    db_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> Generator[TestClient, None, None]:
    """FastAPI TestClient with all services wired to the test DB.

    Patches applied (in order):
    1. ``app.api.routes.snapshots.service`` — the module-level singleton.
    2. ``app.repositories.manual_model.settings`` — used by ``_manual_repo()``.
    3. ``get_settings`` lru_cache cleared + env vars set so topology handlers
       pick up the test DB URL and mock inventory.
    """
    from app.core.config import get_settings, Settings
    from app.repositories.snapshots import SnapshotRepository
    from app.services.snapshots import SnapshotService
    import app.api.routes.snapshots as snap_routes
    import app.repositories.manual_model as mm_repo_mod

    # 1. Patch snapshot route service singleton
    test_snap_repo = SnapshotRepository(database_url=db_url)
    test_snap_svc = SnapshotService(repository=test_snap_repo)
    monkeypatch.setattr(snap_routes, "service", test_snap_svc)

    # 2. Build test settings and patch manual_model module-level settings
    test_settings = Settings(
        database_url=db_url,
        topology_mode="mock",
        export_root=str(db_path.parent / "exports"),
    )
    monkeypatch.setattr(mm_repo_mod, "settings", test_settings)

    # 3. Clear lru_cache and inject env vars so topology route handlers
    #    calling get_settings() directly pick up the test configuration.
    get_settings.cache_clear()
    monkeypatch.setenv("AZVISION_DATABASE_URL", db_url)
    monkeypatch.setenv("TOPOLOGY_MODE", "mock")
    monkeypatch.setenv("AZVISION_EXPORT_ROOT", str(db_path.parent / "exports"))

    from app.main import app

    with TestClient(app, raise_server_exceptions=True) as c:
        yield c

    # Restore cache so subsequent tests start fresh
    get_settings.cache_clear()
