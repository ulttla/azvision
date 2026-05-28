from __future__ import annotations

import asyncio
import json

from fastapi.exceptions import RequestValidationError
from fastapi.testclient import TestClient
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.response_utils import build_error_response, build_rate_limited_response
from app.core.azure_client import AzureClientError
from app.main import (
    azure_client_error_handler,
    http_exception_handler,
    unhandled_exception_handler,
    validation_exception_handler,
)


def _response_body(response) -> dict:
    return json.loads(response.body.decode("utf-8"))


def test_build_error_response_preserves_payload_and_status_fields() -> None:
    body = build_error_response(
        status="http-418",
        message="short and clear",
        ok=False,
        request_id="req-123",
        details={"field": "value"},
    )

    assert body == {
        "request_id": "req-123",
        "details": {"field": "value"},
        "ok": False,
        "status": "http-418",
        "message": "short and clear",
    }


def test_build_error_response_allows_empty_and_special_character_messages() -> None:
    assert build_error_response(message="")["message"] == ""
    assert build_error_response(message="quotes ' \" and unicode ✓")["message"] == "quotes ' \" and unicode ✓"


def test_build_error_response_defaults_to_error_shape() -> None:
    assert build_error_response(message="failed") == {
        "ok": False,
        "status": "error",
        "message": "failed",
    }


def test_azure_client_error_handler_returns_stable_502_payload() -> None:
    response = asyncio.run(azure_client_error_handler(None, AzureClientError("credential unavailable")))

    assert response.status_code == 502
    assert _response_body(response) == {
        "ok": False,
        "status": "azure-error",
        "message": "credential unavailable",
    }


def test_http_exception_handler_returns_custom_status_payload() -> None:
    response = asyncio.run(http_exception_handler(None, StarletteHTTPException(status_code=404, detail="missing")))

    assert response.status_code == 404
    assert _response_body(response) == {
        "ok": False,
        "status": "http-404",
        "message": "missing",
    }


def test_validation_exception_handler_formats_first_error_location() -> None:
    exc = RequestValidationError(
        [
            {
                "type": "greater_than_equal",
                "loc": ("query", "resource_limit"),
                "msg": "Input should be greater than or equal to 1",
                "input": "0",
            }
        ]
    )

    response = asyncio.run(validation_exception_handler(None, exc))

    assert response.status_code == 422
    assert _response_body(response) == {
        "ok": False,
        "status": "http-422",
        "message": "query -> resource_limit: Input should be greater than or equal to 1",
    }


def test_validation_exception_handler_handles_empty_error_list() -> None:
    response = asyncio.run(validation_exception_handler(None, RequestValidationError([])))

    assert response.status_code == 422
    assert _response_body(response) == {
        "ok": False,
        "status": "http-422",
        "message": "Validation error",
    }


def test_http_exception_handler_hides_5xx_detail_when_debug_disabled(monkeypatch) -> None:
    import app.main as main

    monkeypatch.setattr(main.settings, "debug", False)
    response = asyncio.run(
        http_exception_handler(None, StarletteHTTPException(status_code=500, detail="secret backend detail"))
    )

    assert response.status_code == 500
    assert _response_body(response) == {
        "ok": False,
        "status": "http-500",
        "message": "Internal server error",
    }


def test_unhandled_exception_handler_hides_detail_when_debug_disabled(monkeypatch) -> None:
    import app.main as main

    monkeypatch.setattr(main.settings, "debug", False)
    response = asyncio.run(unhandled_exception_handler(None, RuntimeError("secret traceback detail")))

    assert response.status_code == 500
    assert _response_body(response) == {
        "ok": False,
        "status": "http-500",
        "message": "Internal server error",
    }


def test_security_headers_include_public_beta_baseline() -> None:
    from app.main import app

    response = TestClient(app).get("/healthz")

    assert response.status_code == 200
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] == "DENY"
    assert response.headers["Referrer-Policy"] == "no-referrer"
    assert response.headers["Permissions-Policy"] == "camera=(), microphone=(), geolocation=()"
    assert "default-src 'self'" in response.headers["Content-Security-Policy"]
    assert "frame-ancestors 'none'" in response.headers["Content-Security-Policy"]
    assert response.headers["X-XSS-Protection"] == "0"


def test_hsts_is_enabled_when_debug_is_disabled(monkeypatch) -> None:
    import app.main as main

    monkeypatch.setattr(main.settings, "debug", False)
    response = TestClient(main.app).get("/healthz")

    assert response.headers["Strict-Transport-Security"] == "max-age=31536000; includeSubDomains"


def test_request_id_header_is_returned() -> None:
    from app.main import app

    response = TestClient(app).get("/healthz", headers={"X-Request-ID": "req-test-123"})

    assert response.status_code == 200
    assert response.headers["X-Request-ID"] == "req-test-123"


def test_request_id_header_is_generated_when_missing() -> None:
    from app.main import app

    response = TestClient(app).get("/healthz")

    assert response.status_code == 200
    assert response.headers["X-Request-ID"].startswith("req_")


def test_request_completion_log_uses_safe_metadata(caplog) -> None:
    import logging

    from app.main import app

    caplog.set_level(logging.INFO, logger="azvision.request")
    response = TestClient(app).get("/healthz", headers={"X-Request-ID": "req-log-123"})

    assert response.status_code == 200
    records = [record for record in caplog.records if record.name == "azvision.request"]
    assert records
    record = records[-1]
    assert record.getMessage() == "request_completed"
    assert record.request_id == "req-log-123"
    assert record.method == "GET"
    assert record.path == "/healthz"
    assert record.status_code == 200
    assert isinstance(record.duration_ms, float)
    assert not hasattr(record, "body")
    assert not hasattr(record, "query_params")


def test_rate_limited_response_contract() -> None:
    response = build_rate_limited_response(retry_after_seconds=30)

    assert response.status_code == 429
    assert response.headers["Retry-After"] == "30"
    assert _response_body(response) == {
        "ok": False,
        "status": "rate-limited",
        "message": "Too many requests. Please retry later.",
    }


def test_rate_limited_response_clamps_negative_retry_after() -> None:
    response = build_rate_limited_response(retry_after_seconds=-10)

    assert response.status_code == 429
    assert response.headers["Retry-After"] == "0"
