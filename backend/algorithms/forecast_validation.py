"""Pure selection and time alignment for CAMS forecast field evaluation."""

from __future__ import annotations

from datetime import UTC, datetime
from math import isfinite

from .distance import haversine_km


def select_cohort(stations: list[dict], count: int = 10) -> list[dict]:
    """Choose 103t and geographically spread official stations, deterministically."""

    eligible = [
        row
        for row in stations
        if row.get("id") and row.get("lat") is not None and row.get("lon") is not None
    ]
    eligible.sort(key=lambda row: str(row["id"]))
    if not eligible:
        return []
    seed = next((row for row in eligible if str(row["id"]) == "103t"), eligible[0])
    selected = [seed]
    remaining = [row for row in eligible if row is not seed]
    while remaining and len(selected) < count:
        next_row = max(
            remaining,
            key=lambda row: (
                min(
                    haversine_km(
                        float(row["lat"]),
                        float(row["lon"]),
                        float(chosen["lat"]),
                        float(chosen["lon"]),
                    )
                    for chosen in selected
                ),
                str(row["id"]),
            ),
        )
        selected.append(next_row)
        remaining.remove(next_row)
    return selected


def collection_slot(now: datetime) -> datetime:
    """One idempotent UTC slot per six-hour collection window."""

    instant = now.astimezone(UTC)
    return instant.replace(
        hour=(instant.hour // 6) * 6, minute=0, second=0, microsecond=0
    )


def validation_pairs(snapshots: list[dict], observations: list[dict]) -> list[dict]:
    """Pair only forecasts made before a matching, explicit 1h observation."""

    def utc_hour(value: object) -> datetime | None:
        try:
            parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        except ValueError:
            return None
        if parsed.tzinfo is None:
            return None
        normalized = parsed.astimezone(UTC)
        return (
            normalized
            if normalized.minute == normalized.second == normalized.microsecond == 0
            else None
        )

    observed = {}
    for row in observations:
        if (
            row.get("average_period_minutes") != 60
            or row.get("source") != "air4thai_official_hourly"
        ):
            continue
        hour = utc_hour(row.get("valid_at"))
        if hour is not None:
            observed[(str(row["station_id"]), hour)] = row
    pairs = []
    for row in snapshots:
        hour = utc_hour(row.get("valid_at"))
        if hour is None:
            continue
        key = (str(row["station_id"]), hour)
        actual = observed.get(key)
        if not actual:
            continue
        try:
            fetched = datetime.fromisoformat(
                str(row["fetched_at"]).replace("Z", "+00:00")
            )
            forecast = float(row["pm25"])
            measured = float(actual["pm25"])
        except (KeyError, TypeError, ValueError):
            continue
        if (
            fetched.tzinfo is None
            or fetched >= hour
            or not isfinite(forecast)
            or not isfinite(measured)
            or forecast < 0
            or measured < 0
        ):
            continue
        hours = int((hour - fetched).total_seconds() // 3600) + 1
        if not 1 <= hours <= 24:
            continue
        pairs.append(
            {
                "station_id": key[0],
                "valid_at": hour.isoformat(),
                "horizon_band": "1-6h" if hours <= 6 else "7-24h",
                "error": forecast - measured,
            }
        )
    return pairs


def provisional_metrics(pairs: list[dict]) -> dict[str, dict]:
    """Descriptive MAE and signed bias; never feed values into public forecasts."""

    result = {}
    for band in ("1-6h", "7-24h"):
        errors = [row["error"] for row in pairs if row["horizon_band"] == band]
        if errors:
            result[band] = {
                "count": len(errors),
                "mae": sum(abs(value) for value in errors) / len(errors),
                "bias": sum(errors) / len(errors),
            }
    return result
