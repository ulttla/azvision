from __future__ import annotations

from typing import Callable, TypeVar

import requests

from app.core.azure_client import AzureClientError

T = TypeVar("T")
ErrorT = TypeVar("ErrorT", bound=AzureClientError)


def extract_azure_error_message(exc: AzureClientError | requests.HTTPError) -> str:
    if isinstance(exc, requests.HTTPError):
        response = exc.response
        return response.text[:500] if response is not None else str(exc)
    return str(exc)


def wrap_azure_operation(operation: Callable[[], T], error_cls: type[ErrorT]) -> T:
    try:
        return operation()
    except error_cls:
        raise
    except (AzureClientError, requests.HTTPError) as exc:
        raise error_cls(extract_azure_error_message(exc)) from exc
