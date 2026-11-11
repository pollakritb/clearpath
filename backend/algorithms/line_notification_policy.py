"""Pure allowlist and source eligibility for automatic LINE notifications."""

from __future__ import annotations

import math
from datetime import UTC, datetime
from uuid import NAMESPACE_URL, UUID, uuid5

from .distance import haversine_km

LINE_EVENT_TYPES = frozenset(
    {"measurement_request", "measurement_fulfilled", "air_alert"}
)


def line_event_type(payload: dict) -> str | None:
    if payload.get("event_type"):
        return str(payload["event_type"])
    if payload.get("measurement_group_id"):
        return "measurement_request"
    if payload.get("measurement_kind"):
        return str(payload["measurement_kind"])
    tag = str(payload.get("tag") or "")
    if tag.startswith("measurement-group:"):
        return "measurement_request"
    if tag.startswith("measurement:"):
        parts = tag.split(":")
        return parts[2] if len(parts) >= 4 else None
    if tag.startswith("alert:pm25:"):
        return "air_alert"
    return None


def line_retry_key(event_id: str, existing: object = None) -> str:
    try:
        UUID(str(existing))
        return str(existing)
    except (ValueError, TypeError, AttributeError):
        return str(uuid5(NAMESPACE_URL, f"clearpath-line:{event_id}"))


def air_alert_eligible(payload: dict, preferences: dict, now: datetime) -> bool:
    """Preserve the existing 90-minute alert limit, and recheck opt-out/area."""
    if preferences.get("air_alerts", True) is False:
        return False
    try:
        recorded = datetime.fromisoformat(
            str(payload["source_at"]).replace("Z", "+00:00")
        )
        if recorded.tzinfo is None:
            return False
        age = (now.astimezone(UTC) - recorded).total_seconds() / 60
        pm25 = float(payload["pm25"])
        threshold = float(preferences.get("pm25_threshold", 37.5))
        lat, lon = float(payload["lat"]), float(payload["lon"])
        center_lat = float(preferences["center_lat"])
        center_lon = float(preferences["center_lon"])
        radius = float(preferences.get("radius_km", 10))
        values = [pm25, threshold, lat, lon, center_lat, center_lon, radius]
        return bool(
            all(math.isfinite(v) for v in values)
            and 0 <= age <= 90
            and pm25 >= 0
            and pm25 >= threshold
            and -90 <= lat <= 90
            and -90 <= center_lat <= 90
            and -180 <= lon <= 180
            and -180 <= center_lon <= 180
            and 1 <= radius <= 50
            and haversine_km(lat, lon, center_lat, center_lon) <= radius
        )
    except (KeyError, ValueError, TypeError, OverflowError):
        return False
