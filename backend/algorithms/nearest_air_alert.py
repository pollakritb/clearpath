"""Shared pin/GPS eligibility plus historical v2 policy for audit regressions.

Current notification decisions live in nearby_air_alert (per observation, no
daily quota). nearest_source and transition are historical verification only.
"""

from __future__ import annotations

import math
from datetime import UTC, datetime

from .distance import haversine_km
from .notification_policy import BANGKOK_TZ

POLICY_VERSION = "nearest-pin-daily-v2"
ALERT_RADIUS_KM = 2.0
LOCATION_TTL_SECONDS = 86400
MAX_ACCURACY_M = 200
SOURCE_TTL_SECONDS = {"station": 3600, "community": 10800}


def timestamp(value: object) -> datetime | None:
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return parsed.astimezone(UTC) if parsed.tzinfo else None
    except (ValueError, TypeError, OverflowError):
        return None


def finite(value: object) -> float | None:
    try:
        result = float(value)
        return result if math.isfinite(result) else None
    except (TypeError, ValueError, OverflowError):
        return None


def valid_location(location: dict | None, now: datetime) -> bool:
    if not location:
        return False
    lat, lon, accuracy = (finite(location.get(k)) for k in ("lat", "lon", "accuracy_m"))
    observed = timestamp(location.get("observed_at"))
    return bool(
        lat is not None
        and -90 <= lat <= 90
        and lon is not None
        and -180 <= lon <= 180
        and accuracy is not None
        and 0 <= accuracy <= MAX_ACCURACY_M
        and observed
        and 0 <= (now - observed).total_seconds() <= LOCATION_TTL_SECONDS
    )


def nearby_sources(
    location: dict | None, candidates: list[dict], radius_km: float, now: datetime
) -> list[dict]:
    """All fresh eligible pins, ordered by distance without concentration filtering."""
    radius = finite(radius_km)
    if not valid_location(location, now) or radius is None or not 1 <= radius <= 50:
        return []
    ranked = []
    for source in candidates:
        kind = source.get("source_type")
        at = timestamp(source.get("source_at"))
        pm25, lat, lon = (finite(source.get(k)) for k in ("pm25", "lat", "lon"))
        if (
            kind not in SOURCE_TTL_SECONDS
            or at is None
            or not 0 <= (now - at).total_seconds() <= SOURCE_TTL_SECONDS[kind]
            or pm25 is None
            or pm25 < 0
            or lat is None
            or not -90 <= lat <= 90
            or lon is None
            or not -180 <= lon <= 180
            or kind == "community"
            and source.get("status") != "approved"
        ):
            continue
        distance = haversine_km(
            float(location["lat"]), float(location["lon"]), lat, lon
        )
        if distance <= radius:
            ranked.append(
                (distance, -at.timestamp(), f"{kind}:{source['source_id']}", source)
            )
    return [
        {**source, "distance_km": distance, "policy_version": POLICY_VERSION}
        for distance, _, _, source in sorted(ranked, key=lambda item: item[:3])
    ]


def nearest_source(
    location: dict | None, candidates: list[dict], radius_km: float, now: datetime
) -> dict | None:
    """Legacy nearest-pin selection retained for historical policy verification."""
    sources = nearby_sources(location, candidates, radius_km, now)
    return sources[0] if sources else None


def alert_severity(pm25: object) -> int:
    value = finite(pm25)
    if value is None or value < 37.6:
        return 0
    # Concentrations retain their original precision; >75 is the upper band.
    return 2 if value > 75.0 else 1


def alert_day(now: datetime) -> str:
    return now.astimezone(BANGKOK_TZ).date().isoformat()


def level_enabled(preferences: dict, severity: int) -> bool:
    return bool(
        preferences.get("air_alerts", True)
        and severity in (1, 2)
        and preferences.get(
            "air_alert_warning" if severity == 1 else "air_alert_danger", True
        )
    )


def transition(
    state: dict,
    source: dict | None,
    threshold: float,
    now: datetime,
    *,
    warning_enabled: bool = True,
    danger_enabled: bool = True,
) -> dict:
    """At most one rising alert per band per Bangkok calendar day.

    Legacy threshold is accepted for callers but cannot override fixed bands.
    Missing/low data, pin changes and recovery do not replenish a day's quota.
    """
    result = dict(state)
    day = alert_day(now)
    previous_day = state.get("alert_day")
    if previous_day is None:
        last = timestamp(state.get("last_notified_at"))
        previous_day = alert_day(last) if last else None
    previous = int(state.get("severity") or 0) if previous_day == day else 0
    result.update(notify=False, alert_day=day, severity=previous, low_since=None)
    severity = alert_severity(source.get("pm25")) if source else 0
    enabled = warning_enabled if severity == 1 else danger_enabled
    if severity and enabled and severity > previous:
        result.update(notify=True, severity=severity, last_notified_at=now.isoformat())
    return result
