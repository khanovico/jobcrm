from __future__ import annotations

import time
from collections import defaultdict


class MinuteRateLimiter:
    """Simple per-key sliding minute window (in-memory)."""

    def __init__(self, max_per_minute: int) -> None:
        self.max_per_minute = max_per_minute
        self._hits: dict[str, list[float]] = defaultdict(list)

    def allow(self, key_id: str) -> bool:
        now = time.time()
        window = [t for t in self._hits[key_id] if now - t < 60.0]
        if len(window) >= self.max_per_minute:
            self._hits[key_id] = window
            return False
        window.append(now)
        self._hits[key_id] = window
        return True
