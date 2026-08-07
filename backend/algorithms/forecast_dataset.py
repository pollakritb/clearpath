"""Pure point-in-time joins for forecast dataset construction."""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Mapping, Sequence
from datetime import timedelta

from .forecast_quality import parse_timestamp


def _hour_key(value: object) -> int:
    return int(parse_timestamp(value).timestamp() // 3600)


def latest_issued_forecast(
    rows: Sequence[Mapping[str, object]],
    *,
    station_id: str,
    prediction_at: object,
    target_at: object,
    tolerance_minutes: float = 90,
) -> Mapping[str, object] | None:
    """Select only a forecast issued by prediction time for the target hour."""

    prediction_time = parse_timestamp(prediction_at)
    target_time = parse_timestamp(target_at)
    candidates = []
    for row in rows:
        if str(row.get("station_id") or "") != station_id:
            continue
        try:
            issued_at = parse_timestamp(row.get("issued_at"))
            forecast_at = parse_timestamp(row.get("forecast_at"))
        except (TypeError, ValueError):
            continue
        if issued_at > prediction_time:
            continue
        if abs((forecast_at - target_time).total_seconds()) > tolerance_minutes * 60:
            continue
        candidates.append((issued_at, row))
    return max(candidates, key=lambda item: item[0])[1] if candidates else None


def join_hourly_sources(
    readings: Sequence[Mapping[str, object]],
    weather_observations: Sequence[Mapping[str, object]],
    fire_snapshots: Sequence[Mapping[str, object]],
    weather_forecasts: Sequence[Mapping[str, object]],
    *,
    station_metadata: Mapping[str, Mapping[str, object]],
    horizons: Sequence[int] = (1, 3, 6, 12, 24),
) -> list[dict]:
    """Join source snapshots while preserving source status and issued time."""

    weather_index = {
        (str(row.get("station_id") or ""), _hour_key(row.get("recorded_at"))): row
        for row in weather_observations
        if row.get("recorded_at")
    }
    fire_index = {
        (str(row.get("station_id") or ""), _hour_key(row.get("recorded_at"))): row
        for row in fire_snapshots
        if row.get("recorded_at")
    }
    forecasts_by_station: dict[str, list[Mapping[str, object]]] = defaultdict(list)
    for row in weather_forecasts:
        forecasts_by_station[str(row.get("station_id") or "")].append(row)

    joined = []
    for reading in sorted(
        readings,
        key=lambda row: (
            str(row.get("station_id") or ""),
            str(row.get("recorded_at") or ""),
        ),
    ):
        station_id = str(reading.get("station_id") or "")
        prediction_at = parse_timestamp(reading.get("recorded_at"))
        key = (station_id, int(prediction_at.timestamp() // 3600))
        weather = weather_index.get(key)
        fire = fire_index.get(key)
        metadata = station_metadata.get(station_id, {})
        result = {
            **reading,
            "station_lat": metadata.get("lat"),
            "station_lon": metadata.get("lon"),
            "district": metadata.get("district"),
            "weather_status": "observed" if weather else "missing",
            "weather_source_at": weather.get("recorded_at") if weather else None,
            "fire_status": "observed" if fire else "missing",
            "fire_source_at": fire.get("recorded_at") if fire else None,
        }
        for name in ("temperature", "humidity", "wind_speed", "wind_deg", "rain_mm"):
            result[name] = weather.get(name) if weather else None
        for name in ("hotspot_count", "weighted_frp", "upwind_hotspot_count"):
            result[name] = fire.get(name) if fire else None
        for horizon in horizons:
            forecast = latest_issued_forecast(
                forecasts_by_station.get(station_id, []),
                station_id=station_id,
                prediction_at=prediction_at,
                target_at=prediction_at + timedelta(hours=horizon),
            )
            result[f"forecast_weather_status_h{horizon}"] = (
                "observed" if forecast else "missing"
            )
            result[f"forecast_weather_issued_at_h{horizon}"] = (
                forecast.get("issued_at") if forecast else None
            )
            for name in (
                "temperature",
                "humidity",
                "wind_speed",
                "wind_deg",
                "rain_mm",
            ):
                result[f"forecast_{name}_h{horizon}"] = (
                    forecast.get(name) if forecast else None
                )
        joined.append(result)
    return joined
