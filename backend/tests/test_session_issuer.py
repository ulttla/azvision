from __future__ import annotations

import hashlib
import sqlite3

from app.auth.session_issuer import disable_account_sessions, issue_workspace_session, revoke_workspace_session, stable_dev_account_id


def test_stable_dev_account_id_is_email_derived_without_plain_email_leak():
    account_id = stable_dev_account_id("owner@example.test")

    assert account_id.startswith("dev-")
    assert account_id == "dev-" + hashlib.sha256(b"owner@example.test").hexdigest()[:12]
    assert "owner" not in account_id
    assert "example" not in account_id


def test_issue_workspace_session_persists_hash_only_and_membership(db_path):
    issued = issue_workspace_session(
        database_url=f"sqlite:///{db_path}",
        workspace_id="workspace-a",
        email="owner@example.test",
        role="owner",
        ttl_minutes=60,
    )

    assert issued.token
    assert issued.token_type == "bearer"
    with sqlite3.connect(str(db_path)) as conn:
        conn.row_factory = sqlite3.Row
        account = conn.execute("SELECT * FROM accounts WHERE id = ?", (issued.account_id,)).fetchone()
        member = conn.execute(
            "SELECT * FROM workspace_members WHERE workspace_id = ? AND account_id = ?",
            ("workspace-a", issued.account_id),
        ).fetchone()
        session = conn.execute("SELECT * FROM sessions WHERE id = ?", (issued.session_id,)).fetchone()

    assert account is not None
    assert member is not None
    assert member["role"] == "owner"
    assert session is not None
    assert session["token_hash"] == hashlib.sha256(issued.token.encode("utf-8")).hexdigest()
    assert issued.token not in session["token_hash"]


def test_revoke_workspace_session_marks_session_revoked_without_token_persistence(db_path):
    issued = issue_workspace_session(
        database_url=f"sqlite:///{db_path}",
        workspace_id="workspace-a",
        email="owner@example.test",
        role="owner",
        ttl_minutes=60,
    )

    revoked = revoke_workspace_session(database_url=f"sqlite:///{db_path}", token=issued.token)

    assert revoked is not None
    assert revoked.session_id == issued.session_id
    assert revoked.account_id == issued.account_id
    with sqlite3.connect(str(db_path)) as conn:
        conn.row_factory = sqlite3.Row
        session = conn.execute("SELECT * FROM sessions WHERE id = ?", (issued.session_id,)).fetchone()
    assert session["revoked_at"] == revoked.revoked_at
    assert issued.token not in session["token_hash"]
    assert revoke_workspace_session(database_url=f"sqlite:///{db_path}", token=issued.token) is None


def test_disable_account_sessions_marks_account_disabled_and_revokes_active_sessions(db_path):
    first = issue_workspace_session(
        database_url=f"sqlite:///{db_path}",
        workspace_id="workspace-a",
        email="owner@example.test",
        role="owner",
        ttl_minutes=60,
    )
    second = issue_workspace_session(
        database_url=f"sqlite:///{db_path}",
        workspace_id="workspace-a",
        email="owner@example.test",
        role="owner",
        ttl_minutes=60,
        account_id=first.account_id,
    )

    disabled = disable_account_sessions(database_url=f"sqlite:///{db_path}", account_id=first.account_id)

    assert disabled is not None
    assert disabled.account_id == first.account_id
    assert disabled.revoked_session_count == 2
    with sqlite3.connect(str(db_path)) as conn:
        conn.row_factory = sqlite3.Row
        account = conn.execute("SELECT * FROM accounts WHERE id = ?", (first.account_id,)).fetchone()
        sessions = conn.execute(
            "SELECT id, revoked_at FROM sessions WHERE account_id = ? ORDER BY id",
            (first.account_id,),
        ).fetchall()
    assert account["disabled_at"] == disabled.disabled_at
    assert {session["id"] for session in sessions} == {first.session_id, second.session_id}
    assert all(session["revoked_at"] == disabled.disabled_at for session in sessions)


def test_disable_account_sessions_returns_none_for_missing_account(db_path):
    assert disable_account_sessions(database_url=f"sqlite:///{db_path}", account_id="missing") is None
