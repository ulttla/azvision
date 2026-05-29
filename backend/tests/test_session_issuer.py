from __future__ import annotations

import hashlib
import sqlite3

from app.auth.session_issuer import issue_workspace_session, stable_dev_account_id


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
