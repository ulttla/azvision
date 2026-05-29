from contextlib import asynccontextmanager
import logging
import sqlite3
from time import perf_counter
from uuid import uuid4
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.rate_limiter import InMemoryRateLimiter, request_rate_limit_key, route_limit_group
from app.api.response_utils import build_error_response, build_rate_limited_response
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
    if status_code == 500 and not settings.debug:
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
request_logger = logging.getLogger("azvision.request")
rate_limiter = InMemoryRateLimiter(window_seconds=settings.rate_limit_window_seconds)

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
async def add_request_id_header(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID") or f"req_{uuid4().hex}"
    request.state.request_id = request_id
    started_at = perf_counter()
    response = await call_next(request)
    response.headers.setdefault("X-Request-ID", request_id)
    duration_ms = round((perf_counter() - started_at) * 1000, 2)
    request_logger.info(
        "request_completed",
        extra={
            "request_id": request_id,
            "method": request.method,
            "path": request.url.path,
            "status_code": response.status_code,
            "duration_ms": duration_ms,
        },
    )
    return response


@app.middleware("http")
async def enforce_rate_limits(request: Request, call_next):
    current_settings = get_settings()
    if not current_settings.rate_limit_enabled:
        return await call_next(request)

    group = route_limit_group(request.url.path)
    limits = {
        "auth": current_settings.rate_limit_auth_per_window,
        "auth_oidc_session": current_settings.rate_limit_auth_oidc_session_per_window,
        "exports": current_settings.rate_limit_exports_per_window,
        "copilot": current_settings.rate_limit_copilot_per_window,
        "default": current_settings.rate_limit_default_per_window,
    }
    allowed, retry_after = rate_limiter.check(
        key=request_rate_limit_key(request),
        limit=limits.get(group, current_settings.rate_limit_default_per_window),
    )
    if not allowed:
        response = build_rate_limited_response(retry_after_seconds=retry_after)
        request_id = getattr(request.state, "request_id", None) or request.headers.get("X-Request-ID") or f"req_{uuid4().hex}"
        response.headers.setdefault("X-Request-ID", request_id)
        return response
    return await call_next(request)


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
    response.headers.setdefault(
        "Content-Security-Policy",
        "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
    )
    response.headers.setdefault("X-XSS-Protection", "0")
    if not settings.debug:
        response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
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
