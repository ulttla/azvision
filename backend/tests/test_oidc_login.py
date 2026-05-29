from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.auth import oidc_login
from app.auth.oidc_login import OIDCLoginError, OIDCNotConfiguredError, verify_oidc_id_token
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
