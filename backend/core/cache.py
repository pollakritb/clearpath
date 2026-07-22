"""In-memory TTL cache เล็กๆ — ลดการยิงซ้ำไปบริการภายนอก

หมายเหตุ: บน serverless (Vercel Fluid Compute) cache อยู่ใน instance ที่ warm เท่านั้น
ช่วยลด rate-limit/latency ภายใน instance เดียวกัน (ไม่ใช่ shared cache ข้าม instance)
"""

from __future__ import annotations

import time
from collections.abc import Hashable
from typing import Any


class TTLCache:
    def __init__(self, ttl_seconds: float):
        self.ttl = ttl_seconds
        self._store: dict[Hashable, tuple[float, Any]] = {}

    def get(self, key: Hashable) -> Any | None:
        item = self._store.get(key)
        if item is None:
            return None
        expiry, value = item
        if time.monotonic() > expiry:
            self._store.pop(key, None)
            return None
        return value

    def set(self, key: Hashable, value: Any) -> None:
        self._store[key] = (time.monotonic() + self.ttl, value)

    def clear(self) -> None:
        self._store.clear()
