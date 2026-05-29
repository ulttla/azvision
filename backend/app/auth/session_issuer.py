from __future__ import annotations

import hashlib
import secrets
import sqlite3
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from app.api.workspace_security import _resolve_sqlite_path


@dataclass(frozen=True)
class IssuedWorkspaceSession:
    session_id: str
    account_id: str
    workspace_id: str
    role: str
    expires_at: str
    token: str
    token_type: str = "bearer"


@dataclass(frozen=True)
class RevokedWorkspaceSession:
    session_id: str
    account_id: str
    revoked_at: str


def stable_dev_account_id(email: str) -> str:
    return f"dev-{hashlib.sha256(email.encode('utf-8')).hexdigest()[:12]}"


def issue_workspace_session(
    *,
    database_url: str,
    workspace_id: str,
    email: str,
    role: str,
    ttl_minutes: int,
    account_id: str | None = None,
    display_name: str | None = None,
) -> IssuedWorkspaceSession:
    """Create an account/member/session tuple and return the bearer token once.

    The raw token is intentionally returned only to the caller and only its
    SHA-256 hash is persisted. This helper is identity-provider agnostic so a
    future real login/OIDC route can share the same persistence path as the
    local dev-session issuer.
    """
    if role not in {"owner", "viewer"}:
        raise ValueError("role must be owner or viewer")
    ttl_minutes = max(5, min(int(ttl_minutes), 24 * 60))
    resolved_account_id = account_id or stable_dev_account_id(email)
    token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    session_id = f"sess_{uuid.uuid4().hex}"
    member_id = f"member_{uuid.uuid4().hex}"
    expires_at = (datetime.now(UTC) + timedelta(minutes=ttl_minutes)).isoformat()

    db_path = _resolve_sqlite_path(database_url)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(str(db_path)) as conn:
        conn.execute(
            """
            INSERT INTO accounts(id, email, display_name)
            VALUES (?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET email=excluded.email, display_name=excluded.display_name
            """,
            (resolved_account_id, email, display_name or email),
        )
        conn.execute(
            """
            INSERT INTO workspace_members(id, workspace_id, account_id, role)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(workspace_id, account_id) DO UPDATE SET role=excluded.role
            """,
            (member_id, workspace_id, resolved_account_id, role),
        )
        conn.execute(
            """
            INSERT INTO sessions(id, account_id, token_hash, expires_at)
            VALUES (?, ?, ?, ?)
            """,
            (session_id, resolved_account_id, token_hash, expires_at),
        )
        conn.commit()

    return IssuedWorkspaceSession(
        session_id=session_id,
        account_id=resolved_account_id,
        workspace_id=workspace_id,
        role=role,
        expires_at=expires_at,
        token=token,
    )


def revoke_workspace_session(*, database_url: str, token: str) -> RevokedWorkspaceSession | None:
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    db_path = _resolve_sqlite_path(database_url)
    if not db_path.exists():
        return None

    revoked_at = datetime.now(UTC).isoformat()
    with sqlite3.connect(str(db_path)) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            """
            SELECT id, account_id
            FROM sessions
            WHERE token_hash = ? AND revoked_at IS NULL
            """,
            (token_hash,),
        ).fetchone()
        if row is None:
            return None
        conn.execute(
            "UPDATE sessions SET revoked_at = ? WHERE id = ?",
            (revoked_at, row["id"]),
        )
        conn.commit()

    return RevokedWorkspaceSession(
        session_id=row["id"],
        account_id=row["account_id"],
        revoked_at=revoked_at,
    )
