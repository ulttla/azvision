from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]
PROJECT_DIR = Path(__file__).resolve().parents[3]
ENV_FILE_CANDIDATES = (
    PROJECT_DIR / ".env",
    BACKEND_DIR / ".env",
)
DEFAULT_CORS_DEV_PORTS = (5173, 4173, 4174, 4175, 4176)
DEFAULT_CORS_ORIGINS = ",".join(
    f"http://{host}:{port}"
    for port in DEFAULT_CORS_DEV_PORTS
    for host in ("localhost", "127.0.0.1")
)


class Settings(BaseSettings):
    app_name: str = "AzVision API"
    environment: str = Field(
        default="development",
        validation_alias=AliasChoices("AZVISION_ENVIRONMENT", "AZVISION_ENV"),
    )
    debug: bool = False
    api_v1_prefix: str = "/api/v1"
    cors_origins: str = DEFAULT_CORS_ORIGINS
    allowed_hosts: str = "*"
    database_url: str = "sqlite:///./azvision.db"

    azure_tenant_id: str = Field(
        default="",
        validation_alias=AliasChoices("AZURE_TENANT_ID", "AZVISION_AZURE_TENANT_ID"),
    )
    azure_client_id: str = Field(
        default="",
        validation_alias=AliasChoices("AZURE_CLIENT_ID", "AZVISION_AZURE_CLIENT_ID"),
    )
    azure_certificate_path: str = Field(
        default="",
        validation_alias=AliasChoices(
            "AZURE_CERT_PATH",
            "AZURE_CERTIFICATE_PATH",
            "AZVISION_AZURE_CERT_PATH",
            "AZVISION_AZURE_CERTIFICATE_PATH",
        ),
    )
    azure_certificate_thumbprint: str = Field(
        default="",
        validation_alias=AliasChoices(
            "AZURE_CERT_THUMBPRINT",
            "AZURE_CERTIFICATE_THUMBPRINT",
            "AZVISION_AZURE_CERT_THUMBPRINT",
            "AZVISION_AZURE_CERTIFICATE_THUMBPRINT",
        ),
    )
    azure_certificate_password: str = Field(
        default="",
        validation_alias=AliasChoices(
            "AZURE_CERT_PASSWORD",
            "AZURE_CERTIFICATE_PASSWORD",
            "AZVISION_AZURE_CERT_PASSWORD",
            "AZVISION_AZURE_CERTIFICATE_PASSWORD",
        ),
    )
    azure_cloud: str = Field(
        default="public",
        validation_alias=AliasChoices("AZURE_CLOUD", "AZVISION_AZURE_CLOUD"),
    )
    topology_mode: str = Field(
        default="auto",
        validation_alias=AliasChoices("TOPOLOGY_MODE", "AZVISION_TOPOLOGY_MODE"),
    )

    copilot_enabled: bool = Field(
        default=False,
        validation_alias=AliasChoices("COPILOT_ENABLED", "AZVISION_COPILOT_ENABLED"),
    )
    copilot_default_provider: str = Field(
        default="rule-based",
        validation_alias=AliasChoices("COPILOT_DEFAULT_PROVIDER", "AZVISION_COPILOT_DEFAULT_PROVIDER"),
    )
    ollama_base_url: str = Field(
        default="http://127.0.0.1:11434",
        validation_alias=AliasChoices("OLLAMA_BASE_URL", "AZVISION_OLLAMA_BASE_URL"),
    )
    ollama_model: str = Field(
        default="",
        validation_alias=AliasChoices("OLLAMA_MODEL", "AZVISION_OLLAMA_MODEL"),
    )
    openrouter_api_key: str = Field(
        default="",
        validation_alias=AliasChoices("OPENROUTER_API_KEY", "AZVISION_OPENROUTER_API_KEY"),
    )
    openrouter_base_url: str = Field(
        default="https://openrouter.ai/api/v1",
        validation_alias=AliasChoices("OPENROUTER_BASE_URL", "AZVISION_OPENROUTER_BASE_URL"),
    )
    openrouter_model: str = Field(
        default="",
        validation_alias=AliasChoices("OPENROUTER_MODEL", "AZVISION_OPENROUTER_MODEL"),
    )
    openrouter_http_referer: str = Field(
        default="",
        validation_alias=AliasChoices("OPENROUTER_HTTP_REFERER", "AZVISION_OPENROUTER_HTTP_REFERER"),
    )
    openrouter_app_title: str = Field(
        default="AzVision",
        validation_alias=AliasChoices("OPENROUTER_APP_TITLE", "AZVISION_OPENROUTER_APP_TITLE"),
    )

    workspace_default_id: str = "local-demo"
    workspace_default_name: str = "AzVision Demo Workspace"
    auth_dev_session_enabled: bool = Field(
        default=False,
        validation_alias=AliasChoices("AZVISION_AUTH_DEV_SESSION_ENABLED", "AUTH_DEV_SESSION_ENABLED"),
    )
    auth_oidc_login_enabled: bool = Field(
        default=False,
        validation_alias=AliasChoices("AZVISION_AUTH_OIDC_LOGIN_ENABLED", "AUTH_OIDC_LOGIN_ENABLED"),
    )
    auth_oidc_issuer: str = Field(
        default="",
        validation_alias=AliasChoices("AZVISION_AUTH_OIDC_ISSUER", "AUTH_OIDC_ISSUER"),
    )
    auth_oidc_audience: str = Field(
        default="",
        validation_alias=AliasChoices("AZVISION_AUTH_OIDC_AUDIENCE", "AUTH_OIDC_AUDIENCE"),
    )
    rate_limit_enabled: bool = Field(
        default=False,
        validation_alias=AliasChoices("AZVISION_RATE_LIMIT_ENABLED", "RATE_LIMIT_ENABLED"),
    )
    rate_limit_window_seconds: int = Field(
        default=60,
        validation_alias=AliasChoices("AZVISION_RATE_LIMIT_WINDOW_SECONDS", "RATE_LIMIT_WINDOW_SECONDS"),
    )
    rate_limit_default_per_window: int = Field(
        default=120,
        validation_alias=AliasChoices("AZVISION_RATE_LIMIT_DEFAULT_PER_WINDOW", "RATE_LIMIT_DEFAULT_PER_WINDOW"),
    )
    rate_limit_auth_per_window: int = Field(
        default=20,
        validation_alias=AliasChoices("AZVISION_RATE_LIMIT_AUTH_PER_WINDOW", "RATE_LIMIT_AUTH_PER_WINDOW"),
    )
    rate_limit_exports_per_window: int = Field(
        default=30,
        validation_alias=AliasChoices("AZVISION_RATE_LIMIT_EXPORTS_PER_WINDOW", "RATE_LIMIT_EXPORTS_PER_WINDOW"),
    )
    rate_limit_copilot_per_window: int = Field(
        default=20,
        validation_alias=AliasChoices("AZVISION_RATE_LIMIT_COPILOT_PER_WINDOW", "RATE_LIMIT_COPILOT_PER_WINDOW"),
    )
    export_root: str = str(PROJECT_DIR / "exports")

    model_config = SettingsConfigDict(
        env_prefix="AZVISION_",
        env_file=tuple(str(path) for path in ENV_FILE_CANDIDATES),
        extra="ignore",
        populate_by_name=True,
    )

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def allowed_host_list(self) -> list[str]:
        hosts = [host.strip() for host in self.allowed_hosts.split(",") if host.strip()]
        return hosts or ["*"]

    @property
    def env_file_candidates(self) -> list[str]:
        return [str(path) for path in ENV_FILE_CANDIDATES]

    @property
    def discovered_env_files(self) -> list[str]:
        return [str(path) for path in ENV_FILE_CANDIDATES if path.exists()]

    @property
    def auth_ready(self) -> bool:
        return all(
            [
                self.azure_tenant_id,
                self.azure_client_id,
                self.azure_certificate_path,
            ]
        )

    @property
    def certificate_path_exists(self) -> bool:
        if not self.azure_certificate_path:
            return False
        return Path(self.azure_certificate_path).expanduser().exists()

    @property
    def auth_runtime_ready(self) -> bool:
        return self.auth_ready and self.certificate_path_exists

    @property
    def topology_mode_resolved(self) -> str:
        value = self.topology_mode.strip().lower()
        return value if value in {"live", "mock", "auto"} else "auto"


@lru_cache
def get_settings() -> Settings:
    return Settings()
