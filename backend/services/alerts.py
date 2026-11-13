"""Scheduled PM2.5 and NASA FIRMS notification alert workflow."""

from __future__ import annotations

from starlette.concurrency import run_in_threadpool

from ..algorithms.distance import haversine_km
from ..algorithms.hotspot_policy import public_hotspot_state
from ..algorithms.notification_policy import format_hotspot_alert
from ..algorithms.thailand_boundary import is_in_thailand
from ..core.config import settings
from ..core.errors import ConfigurationError, UpstreamError
from . import fire_feed, firms, notifications, supabase_client


def _near_preference(preference: dict, lat: float, lon: float) -> bool:
    if preference.get("center_lat") is None or preference.get("center_lon") is None:
        return True
    radius = float(preference.get("radius_km") or 10)
    return (
        haversine_km(
            lat,
            lon,
            float(preference["center_lat"]),
            float(preference["center_lon"]),
        )
        <= radius
    )


async def run_alerts() -> dict:
    if not settings.push_enabled:
        return {"ok": True, "disabled": True, "events": 0, "recipients": 0}

    preferences = supabase_client.list_notification_preferences()
    try:
        if settings.external_feed_storage_enabled:
            fire_points = (await fire_feed.get_public_fires(1)).fires
        else:
            fire_points = public_hotspot_state(
                await firms.get_fires(1), area_contains=is_in_thailand
            )["fires"]
    except (ConfigurationError, UpstreamError):
        # Air-quality alerts remain useful when the independent FIRMS source
        # is temporarily unavailable. The next cron run retries automatically.
        fire_points = []
    events = 0
    recipients = 0

    from .air_alerts import evaluate_batch

    air_result = await run_in_threadpool(evaluate_batch)
    events += air_result["queued"]
    recipients += air_result["queued"]

    for fire in fire_points:
        acquired_at = fire.get("acquired_at")
        if not acquired_at:
            continue
        targets = [
            str(item["user_id"])
            for item in preferences
            if item.get("hotspot_alerts", True)
            and _near_preference(item, float(fire["lat"]), float(fire["lon"]))
        ]
        if not targets:
            continue
        message = format_hotspot_alert(
            acquired_at=str(acquired_at),
            area="ประเทศไทย",
            satellite=str(fire.get("satellite") or "") or None,
        )
        event = notifications.publish_alert(
            deduplication_key=str(fire["id"]),
            source="nasa_firms",
            kind="satellite_hotspot",
            severity=message["severity"],
            title=message["title"],
            body=message["body"],
            detected_at=str(acquired_at),
            recipients=targets,
            lat=float(fire["lat"]),
            lon=float(fire["lon"]),
            payload={
                "hotspot_id": fire["id"],
                "frp": fire.get("frp"),
                "satellite": fire.get("satellite"),
                "source_products": fire.get("source_products") or [],
            },
        )
        if event:
            events += 1
            recipients += int(event["recipient_count"])
    return {"ok": True, "disabled": False, "events": events, "recipients": recipients}
