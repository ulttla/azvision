from __future__ import annotations

import hashlib
from dataclasses import dataclass
from importlib import import_module
from typing import Any

from app.core.config import Settings


class OIDCLoginError(ValueError):
    """Raised when an OIDC login attempt is invalid."""


class OIDCNotConfiguredError(RuntimeError):
    """Raised when OIDC verifier/resolver settings are incomplete."""


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


def _jwt_module():
    try:
        return import_module("jwt")
    except ModuleNotFoundError as exc:
        raise OIDCNotConfiguredError("PyJWT is not available.") from exc


def verify_oidc_id_token(settings: Settings, id_token: str) -> VerifiedOIDCIdentity:
    """Verify an OIDC id_token with issuer/audience/JWKS checks.

    This verifier fails closed unless issuer, audience, and JWKS URL are all
    configured. It never trusts caller-supplied claims without signature
    verification.
    """
    issuer = settings.auth_oidc_issuer.strip()
    audience = settings.auth_oidc_audience.strip()
    jwks_url = settings.auth_oidc_jwks_url.strip()
    if not issuer or not audience or not jwks_url:
        raise OIDCNotConfiguredError("OIDC verification is not configured.")

    jwt = _jwt_module()
    try:
        signing_key = jwt.PyJWKClient(jwks_url).get_signing_key_from_jwt(id_token)
        claims = jwt.decode(
            id_token,
            signing_key.key,
            algorithms=["RS256"],
            audience=audience,
            issuer=issuer,
            options={"require": ["iss", "sub", "aud", "exp"]},
        )
    except Exception as exc:  # noqa: BLE001 - PyJWT has several invalid-token classes
        raise OIDCLoginError("Invalid OIDC token.") from exc

    subject = str(claims.get("sub") or "").strip()
    email = str(claims.get("email") or "").strip()
    if not subject or not email:
        raise OIDCLoginError("OIDC token is missing required identity claims.")

    return VerifiedOIDCIdentity(
        issuer=issuer,
        subject=subject,
        email=email,
        display_name=str(claims.get("name") or "").strip() or None,
    )


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
