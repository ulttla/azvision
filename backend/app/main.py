from contextlib import asynccontextmanager
import sqlite3
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.response_utils import build_error_response
from app.api.routes.auth import router as auth_router
from app.api.routes.copilot import router as copilot_router
from app.api.routes.cost import router as cost_router
from app.core.azure_client import AzureClientError
from app.api.routes.exports import router as exports_router
from app.api.routes.inventory import router as inventory_router
from app.api.routes.scans import router as scans_router
from app.api.routes.simulations import router as simulations_router
from app.api.routes.snapshots import router as snapshots_router
from app.api.routes.path_analysis import router as path_analysis_router
from app.api.routes.topology import router as topology_router
from app.api.routes.workspaces import router as workspaces_router
from app.core.config import get_settings
from app.db.models import _resolve_sqlite_path, create_db_and_tables


def public_error_message(status_code: int, detail: Any) -> str:
    if status_code >= 500 and not settings.debug:
        return "Internal server error"
    return str(detail)


def database_ready() -> bool:
    current_settings = get_settings()
    try:
        db_path = _resolve_sqlite_path(current_settings.database_url)
        if not db_path.exists():
            return False
        with sqlite3.connect(f"file:{db_path}?mode=ro", uri=True) as conn:
            conn.execute("SELECT 1").fetchone()
    except Exception:
        return False
    return True


@asynccontextmanager
async def lifespan(_: FastAPI):
    create_db_and_tables()
    yield


settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    debug=settings.debug,
    lifespan=lifespan,
)

if settings.allowed_host_list != ["*"]:
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.allowed_host_list)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
    return response

app.include_router(auth_router, prefix=settings.api_v1_prefix)
app.include_router(workspaces_router, prefix=settings.api_v1_prefix)
app.include_router(inventory_router, prefix=settings.api_v1_prefix)
app.include_router(scans_router, prefix=settings.api_v1_prefix)
app.include_router(simulations_router, prefix=settings.api_v1_prefix)
app.include_router(snapshots_router, prefix=settings.api_v1_prefix)
app.include_router(topology_router, prefix=settings.api_v1_prefix)
app.include_router(path_analysis_router, prefix=settings.api_v1_prefix)
app.include_router(exports_router, prefix=settings.api_v1_prefix)
app.include_router(cost_router, prefix=settings.api_v1_prefix)
app.include_router(copilot_router, prefix=settings.api_v1_prefix)


@app.exception_handler(AzureClientError)
async def azure_client_error_handler(_: Request, exc: AzureClientError) -> JSONResponse:
    return JSONResponse(
        status_code=502,
        content=build_error_response(status="azure-error", message=str(exc)),
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    errors = exc.errors()
    first = errors[0] if errors else {}
    loc = " -> ".join(str(p) for p in first.get("loc", []) if p != "body")
    msg = first.get("msg", "Validation error")
    detail = f"{loc}: {msg}" if loc else msg
    return JSONResponse(
        status_code=422,
        content=build_error_response(status="http-422", message=detail),
    )


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(_: Request, exc: StarletteHTTPException) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content=build_error_response(
            status=f"http-{exc.status_code}",
            message=public_error_message(exc.status_code, exc.detail),
        ),
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(_: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(
        status_code=500,
        content=build_error_response(
            status="http-500",
            message=public_error_message(500, exc),
        ),
    )


@app.get("/")
def root() -> dict[str, str]:
    return {
        "app": settings.app_name,
        "status": "ok",
        "phase": "personal-use-v0.9-plus-product-track",
    }


@app.get("/healthz")
@app.get(f"{settings.api_v1_prefix}/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/readyz")
@app.get(f"{settings.api_v1_prefix}/readyz")
def readyz() -> JSONResponse:
    db_ready = database_ready()
    status_code = 200 if db_ready else 503
    return JSONResponse(
        status_code=status_code,
        content={
            "status": "ok" if db_ready else "degraded",
            "checks": {"database": db_ready},
        },
    )
