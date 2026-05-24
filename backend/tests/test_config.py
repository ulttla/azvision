from app.core.config import Settings


def test_environment_accepts_documented_short_env_alias(monkeypatch):
    monkeypatch.setenv("AZVISION_ENV", "production")

    settings = Settings(_env_file=None)

    assert settings.environment == "production"


def test_environment_accepts_explicit_environment_env_alias(monkeypatch):
    monkeypatch.setenv("AZVISION_ENVIRONMENT", "staging")

    settings = Settings(_env_file=None)

    assert settings.environment == "staging"
