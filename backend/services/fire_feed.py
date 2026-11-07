"""Public NASA FIRMS feed state without turning optional setup into HTTP 503."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Literal

from starlette.concurrency import run_in_threadpool

from ..algorithms.hotspot_policy import public_hotspot_state
from ..algorithms.thailand_boundary import is_in_thailand
from ..core.config import settings
from ..core.errors import ConfigurationError, UpstreamError
from . import firms, store_feeds

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
        stored = None
        if settings.external_feed_storage_enabled and not settings.local_demo_mode:
            if not settings.firms_map_key:
                raise ConfigurationError("firms_not_configured")
            try:
                stored = await run_in_threadpool(store_feeds.state, "nasa_firms")
            except Exception as exc:
                raise UpstreamError("hotspot_snapshot_unavailable") from exc
            if not stored.get("last_success_at"):
                raise UpstreamError("hotspot_snapshot_not_ready")
            points = stored.get("snapshot", {}).get("fires", [])
        else:
            points = await firms.get_fires(days)
        state = public_hotspot_state(
            points,
            area_contains=is_in_thailand,
            now=checked_at,
        )
        if stored:
            state["checked_at"] = stored["checked_at"]
            state["latest_acquired_at"] = stored.get("snapshot", {}).get(
                "latest_acquired_at"
            )
            state["stale_count"] += stored.get("snapshot", {}).get("stale_count", 0)
        if stored and stored.get("last_error"):
            status = "unavailable"
            message = "ซิงก์ NASA FIRMS ไม่สำเร็จ แสดงเฉพาะข้อมูลเดิมที่อายุไม่เกิน 12 ชั่วโมง"
        elif stored and datetime.fromisoformat(
            stored["checked_at"].replace("Z", "+00:00")
        ) < checked_at - timedelta(hours=3):
            status = "unavailable"
            message = "ยังไม่ได้ตรวจ NASA FIRMS รอบใหม่ แสดงเฉพาะข้อมูลเดิมที่อายุไม่เกิน 12 ชั่วโมง"
        elif state["fires"]:
            status = "available"
            message = None
        elif state["stale_count"]:
            status = "stale"
            message = "ข้อมูลจุดความร้อนล่าสุดในประเทศไทยมีอายุเกิน 12 ชั่วโมง"
        else:
            status = "checked_no_hotspots"
            message = "ตรวจ NASA FIRMS แล้ว ไม่พบจุดความร้อนอายุไม่เกิน 12 ชั่วโมงในประเทศไทย"
        return FireFeed(
            fires=state["fires"],
            available=status != "unavailable",
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
