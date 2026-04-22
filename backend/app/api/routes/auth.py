from fastapi import APIRouter, HTTPException

from app.auth.azure_read_test import AzureReadTestError, run_azure_read_test
from app.core.config import get_settings

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/config-check")
def config_check() -> dict:
    settings = get_settings()
    return {
        "status": "ok",
        "phase": "1A-live-read-prep",
        "auth_ready": settings.auth_runtime_ready,
        "checks": {
            "tenant_id_present": bool(settings.azure_tenant_id),
            "client_id_present": bool(settings.azure_client_id),
            "certificate_path_present": bool(settings.azure_certificate_path),
            "certificate_path_exists": settings.certificate_path_exists,
            "certificate_thumbprint_present": bool(settings.azure_certificate_thumbprint),
            "certificate_password_present": bool(settings.azure_certificate_password),
            "azure_cloud": settings.azure_cloud,
            "env_file_candidates": settings.env_file_candidates,
            "discovered_env_files": settings.discovered_env_files,
        },
        "note": "server-side configured credential profile, diagnostics read only. Preferred env file is project root .env; backend/.env is also supported.",
    }


@router.get("/read-test")
def read_test() -> dict:
    settings = get_settings()
    if not settings.auth_runtime_ready:
        raise HTTPException(
            status_code=503,
            detail="Missing required Azure settings or certificate path is invalid. Put Azure values in project root .env or backend/.env and ensure certificate path exists.",
        )

    try:
        result = run_azure_read_test(settings)
        return {
            "ok": result.ok,
            "status": "ok",
            "phase": "1A-live-read-prep",
            "token_acquired": result.token_acquired,
            "accessible_subscriptions": result.accessible_subscriptions,
            "sample_resource_groups": result.sample_resource_groups,
            "message": result.message,
        }
    except AzureReadTestError:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
