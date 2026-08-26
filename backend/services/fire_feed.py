"""Public NASA FIRMS feed state without turning optional setup into HTTP 503."""

from __future__ import annotations

import logging
from dataclasses import dataclass

from ..core.errors import ConfigurationError, UpstreamError
from . import firms

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class FireFeed:
    fires: list[dict]
    available: bool
    message: str | None = None


async def get_public_fires(days: int) -> FireFeed:
    try:
        return FireFeed(fires=await firms.get_fires(days), available=True)
    except ConfigurationError:
        return FireFeed(
            fires=[],
            available=False,
            message="ยังไม่ได้เชื่อม NASA FIRMS จึงยังตรวจสอบจุดความร้อนไม่ได้",
        )
    except UpstreamError as exc:
        logger.warning("firms_upstream_unavailable: %s", exc)
        return FireFeed(
            fires=[],
            available=False,
            message="NASA FIRMS ขัดข้องชั่วคราว จึงยังตรวจสอบจุดความร้อนไม่ได้",
        )
