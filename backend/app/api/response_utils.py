from __future__ import annotations

from typing import Any

from fastapi.responses import JSONResponse


def build_error_response(
    *,
    message: str,
    status: str = "error",
    ok: bool = False,
    **payload: Any,
) -> dict[str, Any]:
    return {
        **payload,
        "ok": ok,
        "status": status,
        "message": message,
    }


RATE_LIMITED_MESSAGE = "Too many requests. Please retry later."


def build_rate_limited_response(*, retry_after_seconds: int | None = None) -> JSONResponse:
    """Build the public beta rate-limit response contract.

    This helper does not enforce limits by itself. It centralizes the stable
    429 payload and optional Retry-After header for future limiter middleware.
    """
    headers: dict[str, str] = {}
    if retry_after_seconds is not None:
        headers["Retry-After"] = str(max(retry_after_seconds, 0))
    return JSONResponse(
        status_code=429,
        headers=headers,
        content=build_error_response(status="rate-limited", message=RATE_LIMITED_MESSAGE),
    )
