from __future__ import annotations

from typing import Any


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
