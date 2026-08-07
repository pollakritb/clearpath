"""Pure, versioned forecast features shared by training and inference."""

from __future__ import annotations

import math
from collections import Counter
from collections.abc import Mapping, Sequence
from datetime import datetime, timedelta, timezone
from statistics import median, pstdev

from .distance import haversine_km
from .forecast_quality import (
    FIRE_FEATURES,
    WEATHER_FEATURES,
    evaluate_feature_value,
    parse_timestamp,
)

FEATURE_VERSION = "forecast-features-v2"
PM25_LAGS = (1, 2, 3, 6, 12, 24, 48, 72)
REQUIRED_CONTIGUOUS_HOURS = 24
ROLLING_WINDOWS = (3, 6, 12, 24)
BANGKOK = timezone(timedelta(hours=7), "Asia/Bangkok")


def _row_index(
    rows: Sequence[Mapping[str, object]], index: int
) -> tuple[datetime, dict[int, Mapping[str, object]]]:
    current = rows[index]
    current_time = parse_timestamp(current.get("recorded_at"))
    station_id = str(current.get("station_id") or "")
    indexed: dict[int, Mapping[str, object]] = {}
    for row in rows[: index + 1]:
        if str(row.get("station_id") or "") != station_id:
            continue
        try:
            timestamp = parse_timestamp(row.get("recorded_at"))
        except (TypeError, ValueError):
            continue
        delta = (current_time - timestamp).total_seconds() / 3600
        rounded = round(delta)
        if abs(delta - rounded) <= 5 / 60 and rounded >= 0:
            indexed[int(rounded)] = row
    return current_time, indexed


def _observed_value(name: str, value: object) -> float:
    result = evaluate_feature_value(name, value)
    return float(result["value"]) if result["usable"] else math.nan


def _optional_feature(
    features: dict[str, float],
    name: str,
    value: object,
    *,
    source_status: object = None,
) -> None:
    result = evaluate_feature_value(
        name,
        value,
        source_status=str(source_status or "") or None,
    )
    features[name] = float(result["value"]) if result["usable"] else math.nan
    features[f"{name}_missing"] = 0.0 if result["state"] == "observed" else 1.0
    features[f"{name}_unavailable"] = 1.0 if result["state"] == "unavailable" else 0.0


def _cyclic(value: float, period: float) -> tuple[float, float]:
    return (
        math.sin(2 * math.pi * value / period),
        math.cos(2 * math.pi * value / period),
    )


def spatial_context(
    station_id: str,
    station_rows: Sequence[Mapping[str, object]],
) -> dict[str, float]:
    """Return nearest-station and regional context using haversine distance."""

    current = next(
        (row for row in station_rows if str(row.get("station_id")) == station_id),
        None,
    )
    if current is None:
        return {}
    try:
        current_lat = float(current["lat"])
        current_lon = float(current["lon"])
    except (KeyError, TypeError, ValueError):
        return {}
    regional_values: list[float] = []
    neighbours: list[tuple[float, float]] = []
    for row in station_rows:
        pm_result = evaluate_feature_value("pm25", row.get("pm25"))
        if not pm_result["usable"]:
            continue
        value = float(pm_result["value"])
        regional_values.append(value)
        if str(row.get("station_id")) == station_id:
            continue
        try:
            distance = haversine_km(
                current_lat,
                current_lon,
                float(row["lat"]),
                float(row["lon"]),
            )
        except (KeyError, TypeError, ValueError):
            continue
        neighbours.append((distance, value))
    result = {
        "station_lat": current_lat,
        "station_lon": current_lon,
    }
    if regional_values:
        result["regional_pm25_median"] = float(median(regional_values))
    if neighbours:
        distance, value = min(neighbours)
        result["nearest_station_distance_km"] = distance
        result["nearest_station_pm25"] = value
    return result


def feature_vector(
    rows: Sequence[Mapping[str, object]],
    index: int,
    *,
    horizon_hours: int | None = None,
) -> dict[str, float]:
    if index < 0 or index >= len(rows):
        raise ValueError("feature_index_out_of_range")
    current_time, indexed = _row_index(rows, index)
    if any(lag not in indexed for lag in range(REQUIRED_CONTIGUOUS_HOURS + 1)):
        raise ValueError("required_pm25_gap")
    required_values = [
        _observed_value("pm25", indexed[lag].get("pm25"))
        for lag in range(REQUIRED_CONTIGUOUS_HOURS + 1)
    ]
    if any(math.isnan(value) for value in required_values):
        raise ValueError("required_pm25_invalid")

    row = rows[index]
    features: dict[str, float] = {"pm25_current": required_values[0]}
    for lag in PM25_LAGS:
        lag_row = indexed.get(lag)
        value = _observed_value("pm25", lag_row.get("pm25")) if lag_row else math.nan
        features[f"pm25_lag_{lag}"] = value
        features[f"pm25_lag_{lag}_missing"] = 1.0 if math.isnan(value) else 0.0

    for window in ROLLING_WINDOWS:
        values = required_values[:window]
        features[f"pm25_mean_{window}"] = sum(values) / len(values)
        features[f"pm25_median_{window}"] = float(median(values))
        features[f"pm25_min_{window}"] = min(values)
        features[f"pm25_max_{window}"] = max(values)
        features[f"pm25_std_{window}"] = pstdev(values) if len(values) > 1 else 0.0
        chronological = list(reversed(values))
        slopes = [
            second - first
            for first, second in zip(
                chronological,
                chronological[1:],
                strict=False,
            )
        ]
        features[f"pm25_slope_{window}"] = float(median(slopes)) if slopes else 0.0
    features["pm25_acceleration_6"] = (required_values[0] - required_values[1]) - (
        required_values[1] - required_values[2]
    )

    local = current_time.astimezone(BANGKOK)
    features["hour_sin"], features["hour_cos"] = _cyclic(local.hour, 24)
    features["day_of_week_sin"], features["day_of_week_cos"] = _cyclic(
        local.weekday(), 7
    )
    features["month_sin"], features["month_cos"] = _cyclic(local.month - 1, 12)
    features["season_rainy"] = 1.0 if local.month in {5, 6, 7, 8, 9, 10} else 0.0

    weather_status = row.get("weather_status")
    for name in WEATHER_FEATURES:
        _optional_feature(
            features,
            name,
            row.get(name),
            source_status=row.get(f"{name}_status") or weather_status,
        )
    wind_deg = features["wind_deg"]
    if math.isnan(wind_deg):
        features["wind_deg_sin"] = math.nan
        features["wind_deg_cos"] = math.nan
    else:
        features["wind_deg_sin"], features["wind_deg_cos"] = _cyclic(wind_deg, 360)

    fire_status = row.get("fire_status")
    for name in FIRE_FEATURES:
        _optional_feature(
            features,
            name,
            row.get(name),
            source_status=row.get(f"{name}_status") or fire_status,
        )

    if horizon_hours is not None:
        forecast_status = row.get(
            f"forecast_weather_status_h{horizon_hours}"
        ) or row.get("forecast_weather_status")
        for name in WEATHER_FEATURES:
            target_name = f"target_{name}"
            _optional_feature(
                features,
                target_name,
                row.get(f"forecast_{name}_h{horizon_hours}")
                if f"forecast_{name}_h{horizon_hours}" in row
                else row.get(target_name),
                source_status=forecast_status,
            )

    for name in (
        "station_lat",
        "station_lon",
        "regional_pm25_median",
        "nearest_station_pm25",
        "nearest_station_distance_km",
    ):
        _optional_feature(features, name, row.get(name))

    for source in ("weather", "fire", "forecast_weather"):
        source_at = row.get(f"{source}_source_at") or row.get(f"{source}_issued_at")
        if source == "forecast_weather" and horizon_hours is not None:
            source_at = (
                row.get(f"forecast_weather_issued_at_h{horizon_hours}") or source_at
            )
        try:
            age = (current_time - parse_timestamp(source_at)).total_seconds() / 60
            features[f"{source}_age_minutes"] = max(0.0, age)
            features[f"{source}_age_missing"] = 0.0
        except (TypeError, ValueError):
            features[f"{source}_age_minutes"] = math.nan
            features[f"{source}_age_missing"] = 1.0
    return features


def training_records(
    rows: Sequence[Mapping[str, object]], horizon_hours: int
) -> tuple[list[dict], Counter[str]]:
    """Create point-in-time examples and explicit exclusion reason counts."""

    if horizon_hours <= 0:
        raise ValueError("horizon_must_be_positive")
    ordered = sorted(rows, key=lambda item: str(item.get("recorded_at") or ""))
    target_lookup = {}
    for row in ordered:
        try:
            key = (
                str(row.get("station_id") or ""),
                parse_timestamp(row.get("recorded_at")),
            )
            target_lookup[key] = row
        except (TypeError, ValueError):
            continue
    records: list[dict] = []
    excluded: Counter[str] = Counter()
    for index, row in enumerate(ordered):
        try:
            prediction_at = parse_timestamp(row.get("recorded_at"))
        except (TypeError, ValueError):
            excluded["prediction_timestamp_invalid"] += 1
            continue
        target_at = prediction_at + timedelta(hours=horizon_hours)
        target = target_lookup.get((str(row.get("station_id") or ""), target_at))
        if target is None:
            excluded["target_missing"] += 1
            continue
        target_result = evaluate_feature_value("pm25", target.get("pm25"))
        if not target_result["usable"]:
            excluded["target_invalid"] += 1
            continue
        try:
            features = feature_vector(
                ordered,
                index,
                horizon_hours=horizon_hours,
            )
        except ValueError as exc:
            excluded[str(exc)] += 1
            continue
        source_times = {
            name: str(row[key])
            for name, key in (
                ("weather", "weather_source_at"),
                ("fire", "fire_source_at"),
                (
                    "forecast_weather",
                    f"forecast_weather_issued_at_h{horizon_hours}",
                ),
            )
            if row.get(key)
        }
        records.append(
            {
                "station_id": str(row.get("station_id") or ""),
                "district": str(row.get("district") or "unknown"),
                "prediction_at": prediction_at.isoformat(),
                "target_at": target_at.isoformat(),
                "features": features,
                "target": float(target_result["value"]),
                "persistence": float(features["pm25_current"]),
                "feature_source_times": source_times,
            }
        )
    return records, excluded


def training_examples(
    rows: Sequence[Mapping[str, object]], horizon_hours: int
) -> tuple[list[dict], list[float]]:
    records, _excluded = training_records(rows, horizon_hours)
    return (
        [record["features"] for record in records],
        [float(record["target"]) for record in records],
    )
