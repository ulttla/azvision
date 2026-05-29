from __future__ import annotations

import sqlite3


def test_credential_profiles_schema_has_workspace_owner_and_secret_ref(db_path):
    with sqlite3.connect(str(db_path)) as conn:
        columns = {
            row[1]: {"type": row[2], "notnull": row[3], "default": row[4]}
            for row in conn.execute("PRAGMA table_info(credential_profiles)").fetchall()
        }
        indexes = {row[1] for row in conn.execute("PRAGMA index_list(credential_profiles)").fetchall()}

    assert columns["workspace_id"]["type"] == "TEXT"
    assert columns["owner_account_id"]["type"] == "TEXT"
    assert columns["secret_ref"]["type"] == "TEXT"
    assert columns["secret_ref"]["notnull"] == 1
    assert columns["metadata_json"]["type"] == "TEXT"
    assert columns["disabled_at"]["type"] == "TEXT"
    assert "idx_credential_profiles_workspace_owner" in indexes


def test_credential_profile_metadata_stores_secret_pointer_not_plain_secret(db_path):
    with sqlite3.connect(str(db_path)) as conn:
        conn.execute(
            """
            INSERT INTO credential_profiles(
                id, workspace_id, owner_account_id, provider, auth_type, secret_ref, metadata_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "cred-a",
                "workspace-a",
                "account-a",
                "azure",
                "certificate",
                "secret://azvision/workspace-a/cred-a",
                '{"tenant_id":"tenant-a"}',
            ),
        )
        row = conn.execute(
            "SELECT workspace_id, owner_account_id, secret_ref, metadata_json FROM credential_profiles WHERE id = ?",
            ("cred-a",),
        ).fetchone()

    assert row == (
        "workspace-a",
        "account-a",
        "secret://azvision/workspace-a/cred-a",
        '{"tenant_id":"tenant-a"}',
    )
    assert "PRIVATE KEY" not in row[3]
    assert "password" not in row[3].lower()
