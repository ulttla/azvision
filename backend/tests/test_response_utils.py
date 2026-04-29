from __future__ import annotations

import asyncio
import json

from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.response_utils import build_error_response
from app.core.azure_client import AzureClientError
from app.main import azure_client_error_handler, http_exception_handler, validation_exception_handler


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
