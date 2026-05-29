from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import Any

from app.core.config import Settings


class OIDCLoginError(ValueError):
    """Raised when an OIDC login attempt is invalid."""


class OIDCNotConfiguredError(RuntimeError):
    """Raised when the real OIDC verifier/resolver is not configured."""


@dataclass(frozen=True)
class VerifiedOIDCIdentity:
    issuer: str
    subject: str
    email: str
    display_name: str | None = None


@dataclass(frozen=True)
class OIDCWorkspaceSessionGrant:
    account_id: str
    email: str
    workspace_id: str
    role: str
    display_name: str | None = None


def oidc_account_id(*, issuer: str, subject: str) -> str:
    stable_key = f"{issuer}|{subject}"
    return f"oidc-{hashlib.sha256(stable_key.encode('utf-8')).hexdigest()[:16]}"


def verify_oidc_id_token(settings: Settings, id_token: str) -> VerifiedOIDCIdentity:
    """Verify an OIDC id_token.

    The production verifier is intentionally not stubbed with insecure parsing.
    Until issuer/JWKS/audience verification is implemented, the public route must
    fail closed instead of trusting user-provided claims.
    """
    raise OIDCNotConfiguredError("OIDC verification is not configured.")


def resolve_oidc_workspace_grant(
    settings: Settings,
    identity: VerifiedOIDCIdentity,
    requested_workspace_id: str | None,
    payload: dict[str, Any],
) -> OIDCWorkspaceSessionGrant:
    """Resolve workspace membership for a verified OIDC identity.

    This is the future invite/tenant mapping seam. It deliberately fails closed
    until account lifecycle and workspace membership mapping are implemented.
    """
    raise OIDCNotConfiguredError("OIDC workspace mapping is not configured.")
