"""Direct-pin alerts: independent of IDW, Trust and gap-fill policy."""

from __future__ import annotations

import math
from datetime import UTC, datetime

from .distance import haversine_km

POLICY_VERSION = "nearest-pin-v1"
LOCATION_TTL_SECONDS = 86400
MAX_ACCURACY_M = 200
SOURCE_TTL_SECONDS = {"station": 3600, "community": 10800}
RECOVERY_SECONDS = 1800
COOLDOWN_SECONDS = 3600


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


def nearest_source(
    location: dict | None, candidates: list[dict], radius_km: float, now: datetime
) -> dict | None:
    """Filter freshness before ranking; never prefilter candidates by PM2.5."""
    radius = finite(radius_km)
    if not valid_location(location, now) or radius is None or not 1 <= radius <= 50:
        return None
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
    if not ranked:
        return None
    distance, _, _, source = min(ranked, key=lambda item: item[:3])
    return {**source, "distance_km": distance, "policy_version": POLICY_VERSION}


def transition(
    state: dict, source: dict | None, threshold: float, now: datetime
) -> dict:
    """Missing data never clears an episode. Switching pins never resets it."""
    result = dict(state)
    result["notify"] = False
    if source is None:
        result["low_since"] = None
        return result
    at = now.isoformat()
    if source["pm25"] < max(37.6, threshold):
        low = timestamp(state.get("low_since"))
        result["low_since"] = state.get("low_since") or at
        if low and (now - low).total_seconds() >= RECOVERY_SECONDS:
            result["severity"] = 0
        return result
    result["low_since"] = None
    severity = 2 if source["pm25"] > 75 else 1
    previous = int(state.get("severity") or 0)
    last = timestamp(state.get("last_notified_at"))
    if severity > previous and (
        previous > 0 or last is None or (now - last).total_seconds() >= COOLDOWN_SECONDS
    ):
        result.update(notify=True, severity=severity, last_notified_at=at)
    return result
