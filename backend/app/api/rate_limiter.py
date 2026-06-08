from __future__ import annotations

import time
from dataclasses import dataclass, field

from typing import Any

from fastapi import Request


@dataclass
class RateLimitBucket:
    window_start: float
    count: int = 0


@dataclass
class InMemoryRateLimiter:
    """Small fixed-window limiter for the public beta API edge.

    It is intentionally process-local. Production can replace the storage with
    Redis or a gateway limiter without changing the response contract.
    """

    window_seconds: int = 60
    buckets: dict[str, RateLimitBucket] = field(default_factory=dict)

    def check(self, *, key: str, limit: int, now: float | None = None) -> tuple[bool, int | None]:
        current = time.time() if now is None else now
        bucket = self.buckets.get(key)
        if bucket is None or current - bucket.window_start >= self.window_seconds:
            self.buckets[key] = RateLimitBucket(window_start=current, count=1)
            return True, None

        bucket.count += 1
        if bucket.count <= limit:
            return True, None

        retry_after = max(0, int(self.window_seconds - (current - bucket.window_start)))
        return False, retry_after


def route_limit_group(path: str) -> str:
    if path.endswith("/auth/oidc/session"):
        return "auth_oidc_session"
    if "/auth/" in path:
        return "auth"
    if "/exports" in path:
        return "exports"
    if "/copilot" in path or path.endswith("/chat"):
        return "copilot"
    return "default"


def request_rate_limit_key(request: Request) -> str:
    host = request.client.host if request.client else "unknown"
    return f"{route_limit_group(request.url.path)}:{host}"


def rate_limit_readiness_summary(settings: Any) -> dict[str, Any]:
    """Return non-secret limiter readiness details for public beta config checks."""
    limits = {
        "default": getattr(settings, "rate_limit_default_per_window", 0),
        "auth": getattr(settings, "rate_limit_auth_per_window", 0),
        "auth_oidc_session": getattr(settings, "rate_limit_auth_oidc_session_per_window", 0),
        "exports": getattr(settings, "rate_limit_exports_per_window", 0),
        "copilot": getattr(settings, "rate_limit_copilot_per_window", 0),
    }
    return {
        "app_limiter_enabled": bool(getattr(settings, "rate_limit_enabled", False)),
        "window_seconds_positive": int(getattr(settings, "rate_limit_window_seconds", 0) or 0) > 0,
        "limits_positive": all(int(value or 0) > 0 for value in limits.values()),
        "configured_group_count": sum(1 for value in limits.values() if int(value or 0) > 0),
        "shared_provider_present": bool(str(getattr(settings, "rate_limit_shared_provider", "")).strip()),
        "shared_enforced": bool(getattr(settings, "rate_limit_shared_enforced", False)),
        "public_beta_shared_gate_satisfied": bool(
            str(getattr(settings, "rate_limit_shared_provider", "")).strip()
            and getattr(settings, "rate_limit_shared_enforced", False)
        ),
    }
