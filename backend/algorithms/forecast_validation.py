"""Pure selection and time alignment for CAMS forecast field evaluation."""

from __future__ import annotations

from datetime import UTC, datetime
from math import isfinite
from statistics import median

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


def forecast_rows_status(
    rows: list[dict], expected_count: int, provider_rows: list[dict] | None = None
) -> str | None:
    """Explain incomplete provider coverage without inventing missing hours."""

    times = [str(row.get("forecast_at")) for row in (provider_rows or rows)]
    if len(times) != len(set(times)):
        return "duplicate_provider_valid_at"
    if not rows:
        return "no_future_pm25"
    if len(rows) < expected_count:
        return "partial_horizon"
    return None


def survey_summary(rows: list[dict]) -> dict:
    """Summarise one spatial survey, including shared provider grid cells."""

    grids: dict[tuple[float, float], list[str]] = {}
    status_counts: dict[str, int] = {}
    distances = []
    anomalies = []
    for row in rows:
        status = str(row.get("status") or "unknown")
        status_counts[status] = status_counts.get(status, 0) + 1
        station_id = str(row["station_id"])
        grid_lat, grid_lon = row.get("grid_lat"), row.get("grid_lon")
        if grid_lat is None or grid_lon is None:
            anomalies.append(
                {
                    "station_id": station_id,
                    "reason": row.get("reason") or "grid_missing",
                }
            )
            continue
        key = (float(grid_lat), float(grid_lon))
        grids.setdefault(key, []).append(station_id)
        distance = haversine_km(
            float(row["requested_lat"]), float(row["requested_lon"]), *key
        )
        distances.append(distance)
        if distance > 75:
            anomalies.append({"station_id": station_id, "reason": "grid_over_75km"})
    return {
        "station_count": len(rows),
        "status_counts": status_counts,
        "unique_grid_count": len(grids),
        "shared_grids": [ids for ids in grids.values() if len(ids) > 1],
        "distance_km": {
            "min": min(distances) if distances else None,
            "median": median(distances) if distances else None,
            "max": max(distances) if distances else None,
        },
        "anomalies": anomalies,
    }


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
            or row.get("timestamp_semantics_verified") is not True
        ):
            continue
        hour = utc_hour(row.get("valid_at"))
        start = utc_hour(row.get("window_start_at"))
        end = utc_hour(row.get("window_end_at"))
        if (
            hour is not None
            and start is not None
            and end == hour
            and (end - start).total_seconds() == 3600
        ):
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
        lead_hours = (hour - fetched).total_seconds() / 3600
        if not 0 < lead_hours <= 24:
            continue
        pairs.append(
            {
                "station_id": key[0],
                "valid_at": hour.isoformat(),
                "fetched_at": fetched.astimezone(UTC).isoformat(),
                "lead_hours": lead_hours,
                "horizon_band": "1-6h" if lead_hours <= 6 else "7-24h",
                "forecast_pm25": forecast,
                "observed_pm25": measured,
                "observation_fetched_at": actual.get("fetched_at"),
                "requested_lat": row.get("requested_lat"),
                "requested_lon": row.get("requested_lon"),
                "region": row.get("region") or "unknown",
                "error": forecast - measured,
                "observation_definition": "official_one_hour_mean_ending_at_valid_at_vs_cams_point_at_valid_at",
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
