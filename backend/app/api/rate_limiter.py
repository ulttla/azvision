from __future__ import annotations

import time
from dataclasses import dataclass, field

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
