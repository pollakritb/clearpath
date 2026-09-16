"""Scheduled PM2.5 and NASA FIRMS Web Push alert workflow."""

from __future__ import annotations

from datetime import UTC, datetime

from ..algorithms.area import is_nakhon_pathom
from ..algorithms.distance import haversine_km
from ..algorithms.notification_policy import format_air_alert, format_hotspot_alert
from ..algorithms.trust import capture_age_minutes
from ..core.config import settings
from . import firms, notifications, supabase_client
from .stations import get_current_stations


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
    stations, _source = await get_current_stations()
    try:
        fire_points = await firms.get_fires(1)
    except Exception:
        # Air-quality alerts remain useful when the independent FIRMS source
        # is temporarily unavailable. The next cron run retries automatically.
        fire_points = []
    events = 0
    recipients = 0

    for station in stations:
        if station.get("pm25") is None or not station.get("recorded_at"):
            continue
        age = capture_age_minutes(str(station["recorded_at"]))
        if age is None or age > 90:
            continue
        pm25 = float(station["pm25"])
        targets = [
            str(item["user_id"])
            for item in preferences
            if item.get("air_alerts", True)
            and pm25 >= float(item.get("pm25_threshold") or 37.5)
            and _near_preference(item, float(station["lat"]), float(station["lon"]))
        ]
        if not targets:
            continue
        message = format_air_alert(
            pm25=pm25,
            station_name=str(station.get("name_th") or station["id"]),
            recorded_at=str(station["recorded_at"]),
            area=str(station.get("province") or "ประเทศไทย"),
        )
        event = notifications.publish_alert(
            deduplication_key=f"pm25:{station['id']}:{station['recorded_at']}",
            source="air4thai",
            kind="pm25_threshold",
            severity=message["severity"],
            title=message["title"],
            body=message["body"],
            detected_at=str(station["recorded_at"]),
            recipients=targets,
            lat=float(station["lat"]),
            lon=float(station["lon"]),
            payload={"station_id": station["id"], "pm25": pm25},
        )
        if event:
            events += 1
            recipients += int(event["recipient_count"])

    now = datetime.now(UTC)
    for fire in fire_points:
        acquired_at = fire.get("acquired_at")
        if not acquired_at or not is_nakhon_pathom(
            float(fire["lat"]), float(fire["lon"])
        ):
            continue
        age = capture_age_minutes(str(acquired_at), now=now)
        if age is None or age > 12 * 60:
            continue
        targets = [
            str(item["user_id"])
            for item in preferences
            if item.get("hotspot_alerts", True)
            and _near_preference(item, float(fire["lat"]), float(fire["lon"]))
        ]
        if not targets:
            continue
        location_key = f"{float(fire['lat']):.3f}:{float(fire['lon']):.3f}"
        message = format_hotspot_alert(
            acquired_at=str(acquired_at),
            area="นครปฐม",
            satellite=str(fire.get("satellite") or "") or None,
        )
        event = notifications.publish_alert(
            deduplication_key=f"firms:{location_key}:{acquired_at}",
            source="nasa_firms",
            kind="satellite_hotspot",
            severity=message["severity"],
            title=message["title"],
            body=message["body"],
            detected_at=str(acquired_at),
            recipients=targets,
            lat=float(fire["lat"]),
            lon=float(fire["lon"]),
            payload={"frp": fire.get("frp"), "satellite": fire.get("satellite")},
        )
        if event:
            events += 1
            recipients += int(event["recipient_count"])
    return {"ok": True, "disabled": False, "events": events, "recipients": recipients}
