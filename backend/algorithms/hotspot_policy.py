"""Pure NASA FIRMS deduplication, freshness, and public-area policy."""

from __future__ import annotations

import hashlib
import math
from collections.abc import Callable, Sequence
from datetime import UTC, datetime, timedelta

from .distance import haversine_km

MAX_PUBLIC_AGE_HOURS = 12
DUPLICATE_DISTANCE_KM = 1.0
DUPLICATE_TIME_MINUTES = 30


def parse_hotspot_time(value: object) -> datetime | None:
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


def _finite_coordinate(point: dict, name: str, minimum: float, maximum: float):
    try:
        value = float(point[name])
    except (KeyError, TypeError, ValueError):
        return None
    return value if math.isfinite(value) and minimum <= value <= maximum else None


def _strength(point: dict) -> tuple[float, float]:
    values = []
    for name in ("frp", "bright"):
        try:
            value = float(point.get(name))
        except (TypeError, ValueError):
            value = 0.0
        values.append(value if math.isfinite(value) else 0.0)
    return values[0], values[1]


def _stable_id(point: dict) -> str:
    identity = "|".join(
        (
            f"{float(point['lat']):.4f}",
            f"{float(point['lon']):.4f}",
            str(point["acquired_at"]),
        )
    )
    return f"firms-{hashlib.sha256(identity.encode()).hexdigest()[:16]}"


def deduplicate_hotspots(
    points: Sequence[dict],
    *,
    distance_km: float = DUPLICATE_DISTANCE_KM,
    time_minutes: int = DUPLICATE_TIME_MINUTES,
) -> list[dict]:
    """Merge overlapping satellite passes and retain the strongest observation."""

    candidates = []
    for point in points:
        lat = _finite_coordinate(point, "lat", -90, 90)
        lon = _finite_coordinate(point, "lon", -180, 180)
        acquired = parse_hotspot_time(point.get("acquired_at"))
        if lat is None or lon is None or acquired is None:
            continue
        candidates.append(
            {
                **point,
                "lat": lat,
                "lon": lon,
                "acquired_at": acquired.isoformat(),
                "source_products": sorted({str(point.get("satellite") or "unknown")}),
            }
        )

    clusters: list[dict] = []
    for candidate in sorted(
        candidates,
        key=lambda row: (row["acquired_at"], row["lat"], row["lon"]),
    ):
        acquired = parse_hotspot_time(candidate["acquired_at"])
        duplicate_index = None
        for index, current in enumerate(clusters):
            current_at = parse_hotspot_time(current["acquired_at"])
            if current_at is None or acquired is None:
                continue
            if abs((acquired - current_at).total_seconds()) > time_minutes * 60:
                continue
            if (
                haversine_km(
                    candidate["lat"],
                    candidate["lon"],
                    current["lat"],
                    current["lon"],
                )
                <= distance_km
            ):
                duplicate_index = index
                break
        if duplicate_index is None:
            clusters.append(candidate)
            continue
        current = clusters[duplicate_index]
        products = sorted(
            set(current.get("source_products") or [])
            | set(candidate.get("source_products") or [])
        )
        winner = candidate if _strength(candidate) > _strength(current) else current
        clusters[duplicate_index] = {**winner, "source_products": products}

    return [
        {**point, "id": _stable_id(point)}
        for point in sorted(
            clusters,
            key=lambda row: (row["acquired_at"], row["lat"], row["lon"]),
            reverse=True,
        )
    ]


def public_hotspot_state(
    points: Sequence[dict],
    *,
    area_contains: Callable[[float, float], bool],
    now: datetime | None = None,
    max_age_hours: int = MAX_PUBLIC_AGE_HOURS,
) -> dict:
    """Return fresh public hotspots while preserving whether stale data existed."""

    checked_at = now or datetime.now(UTC)
    if checked_at.tzinfo is None:
        checked_at = checked_at.replace(tzinfo=UTC)
    maximum_age = timedelta(hours=max(1, max_age_hours))
    in_area = []
    fresh = []
    for point in deduplicate_hotspots(points):
        if not area_contains(float(point["lat"]), float(point["lon"])):
            continue
        acquired = parse_hotspot_time(point["acquired_at"])
        if acquired is None or acquired > checked_at:
            continue
        in_area.append(point)
        if checked_at - acquired <= maximum_age:
            fresh.append(point)
    latest = max((point["acquired_at"] for point in in_area), default=None)
    return {
        "fires": fresh,
        "stale_count": len(in_area) - len(fresh),
        "latest_acquired_at": latest,
        "checked_at": checked_at.isoformat(),
        "max_age_hours": max(1, max_age_hours),
    }
