"""Public NASA FIRMS feed state without turning optional setup into HTTP 503."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Literal

from ..algorithms.area import is_nakhon_pathom
from ..algorithms.hotspot_policy import public_hotspot_state
from ..core.errors import ConfigurationError, UpstreamError
from . import firms

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class FireFeed:
    fires: list[dict]
    available: bool
    status: Literal[
        "available",
        "checked_no_hotspots",
        "stale",
        "unavailable",
        "unconfigured",
    ]
    checked_at: str
    latest_acquired_at: str | None = None
    max_age_hours: int = 12
    message: str | None = None


async def get_public_fires(days: int, *, now: datetime | None = None) -> FireFeed:
    checked_at = now or datetime.now(UTC)
    try:
        state = public_hotspot_state(
            await firms.get_fires(days),
            area_contains=is_nakhon_pathom,
            now=checked_at,
        )
        if state["fires"]:
            status = "available"
            message = None
        elif state["stale_count"]:
            status = "stale"
            message = "ข้อมูลจุดความร้อนล่าสุดในนครปฐมมีอายุเกิน 12 ชั่วโมง"
        else:
            status = "checked_no_hotspots"
            message = "ตรวจ NASA FIRMS แล้ว ไม่พบจุดความร้อนอายุไม่เกิน 12 ชั่วโมงในนครปฐม"
        return FireFeed(
            fires=state["fires"],
            available=True,
            status=status,
            checked_at=state["checked_at"],
            latest_acquired_at=state["latest_acquired_at"],
            max_age_hours=state["max_age_hours"],
            message=message,
        )
    except ConfigurationError:
        return FireFeed(
            fires=[],
            available=False,
            status="unconfigured",
            checked_at=checked_at.isoformat(),
            message="ยังไม่ได้เชื่อม NASA FIRMS จึงยังตรวจสอบจุดความร้อนไม่ได้",
        )
    except UpstreamError as exc:
        logger.warning("firms_upstream_unavailable: %s", exc)
        return FireFeed(
            fires=[],
            available=False,
            status="unavailable",
            checked_at=checked_at.isoformat(),
            message="NASA FIRMS ขัดข้องชั่วคราว จึงยังตรวจสอบจุดความร้อนไม่ได้",
        )
