from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.auth import oidc_login
from app.auth.oidc_login import (
    OIDCLoginError,
    OIDCNotConfiguredError,
    VerifiedOIDCIdentity,
    oidc_account_id,
    resolve_oidc_workspace_grant,
    verify_oidc_id_token,
)
from app.core.config import Settings


def test_verify_oidc_id_token_fails_closed_without_full_settings():
    with pytest.raises(OIDCNotConfiguredError):
        verify_oidc_id_token(Settings(), "opaque")


def test_verify_oidc_id_token_uses_jwks_issuer_and_audience(monkeypatch):
    calls = {}

    class FakePyJWKClient:
        def __init__(self, jwks_url: str):
            calls["jwks_url"] = jwks_url

        def get_signing_key_from_jwt(self, token: str):
            calls["token"] = token
            return SimpleNamespace(key="public-key")

    fake_jwt = SimpleNamespace(
        PyJWKClient=FakePyJWKClient,
        decode=lambda token, key, algorithms, audience, issuer, options: {
            "iss": issuer,
            "sub": "subject-a",
            "aud": audience,
            "exp": 9999999999,
            "email": "owner@example.test",
            "name": "Owner",
        },
    )
    monkeypatch.setattr(oidc_login, "_jwt_module", lambda: fake_jwt)

    identity = verify_oidc_id_token(
        Settings(
            auth_oidc_issuer="https://login.example.test",
            auth_oidc_audience="azvision-api",
            auth_oidc_jwks_url="https://login.example.test/.well-known/jwks.json",
        ),
        "signed-token",
    )

    assert calls == {
        "jwks_url": "https://login.example.test/.well-known/jwks.json",
        "token": "signed-token",
    }
    assert identity.issuer == "https://login.example.test"
    assert identity.subject == "subject-a"
    assert identity.email == "owner@example.test"
    assert identity.display_name == "Owner"


def test_verify_oidc_id_token_requires_subject_and_email(monkeypatch):
    class FakePyJWKClient:
        def __init__(self, jwks_url: str):
            pass

        def get_signing_key_from_jwt(self, token: str):
            return SimpleNamespace(key="public-key")

    fake_jwt = SimpleNamespace(
        PyJWKClient=FakePyJWKClient,
        decode=lambda *args, **kwargs: {"sub": "", "email": ""},
    )
    monkeypatch.setattr(oidc_login, "_jwt_module", lambda: fake_jwt)

    with pytest.raises(OIDCLoginError):
        verify_oidc_id_token(
            Settings(
                auth_oidc_issuer="https://login.example.test",
                auth_oidc_audience="azvision-api",
                auth_oidc_jwks_url="https://login.example.test/jwks",
            ),
            "signed-token",
        )


def test_resolve_oidc_workspace_grant_uses_server_side_mapping_only():
    identity = VerifiedOIDCIdentity(
        issuer="https://login.example.test",
        subject="subject-a",
        email="Owner@Example.Test",
        display_name="Owner",
    )

    grant = resolve_oidc_workspace_grant(
        Settings(
            auth_oidc_workspace_map_json='{"users":{"owner@example.test":{"workspaces":[{"workspace_id":"ws-a","role":"owner"}]}}}'
        ),
        identity,
        "ws-a",
        {"workspace_id": "ws-a", "role": "admin"},
    )

    assert grant.account_id == oidc_account_id(issuer=identity.issuer, subject=identity.subject)
    assert grant.email == "Owner@Example.Test"
    assert grant.workspace_id == "ws-a"
    assert grant.role == "owner"
    assert grant.display_name == "Owner"


def test_resolve_oidc_workspace_grant_rejects_unmapped_workspace():
    identity = VerifiedOIDCIdentity(
        issuer="https://login.example.test",
        subject="subject-a",
        email="owner@example.test",
    )

    with pytest.raises(OIDCLoginError):
        resolve_oidc_workspace_grant(
            Settings(
                auth_oidc_workspace_map_json='{"users":{"owner@example.test":{"workspaces":[{"workspace_id":"ws-a","role":"owner"}]}}}'
            ),
            identity,
            "ws-b",
            {},
        )


def test_resolve_oidc_workspace_grant_fails_closed_without_mapping():
    identity = VerifiedOIDCIdentity(
        issuer="https://login.example.test",
        subject="subject-a",
        email="owner@example.test",
    )

    with pytest.raises(OIDCNotConfiguredError):
        resolve_oidc_workspace_grant(Settings(), identity, None, {})
