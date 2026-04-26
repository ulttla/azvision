from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
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
from app.api.routes.topology import router as topology_router
from app.api.routes.workspaces import router as workspaces_router
from app.core.config import get_settings
from app.db.models import create_db_and_tables


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

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix=settings.api_v1_prefix)
app.include_router(workspaces_router, prefix=settings.api_v1_prefix)
app.include_router(inventory_router, prefix=settings.api_v1_prefix)
app.include_router(scans_router, prefix=settings.api_v1_prefix)
app.include_router(simulations_router, prefix=settings.api_v1_prefix)
app.include_router(snapshots_router, prefix=settings.api_v1_prefix)
app.include_router(topology_router, prefix=settings.api_v1_prefix)
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
            message=str(exc.detail),
        ),
    )


@app.get("/")
def root() -> dict[str, str]:
    return {
        "app": settings.app_name,
        "status": "ok",
        "phase": "1A-sprint-0-scaffold",
    }


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}
