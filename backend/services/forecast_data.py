"""Collect weather forecasts and wind-aware FIRMS features for forecasting."""

from __future__ import annotations

import math
from datetime import UTC, datetime

from ..algorithms.area import is_nakhon_pathom
from ..algorithms.distance import haversine_km
from ..algorithms.trust import capture_age_minutes
from ..core.config import settings
from . import firms, openweather, supabase_client


def _selected(station: dict) -> bool:
    if "นครปฐม" in str(station.get("province") or ""):
        return True
    return is_nakhon_pathom(float(station["lat"]), float(station["lon"]))


def _bearing(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dl = math.radians(lon2 - lon1)
    y = math.sin(dl) * math.cos(p2)
    x = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl)
    return (math.degrees(math.atan2(y, x)) + 360) % 360


def _angle_difference(a: float, b: float) -> float:
    return abs((a - b + 180) % 360 - 180)


async def collect_forecast_inputs(stations: list[dict]) -> dict:
    selected = [station for station in stations if _selected(station)]
    if not selected:
        return {"stations": 0, "weather": 0, "fire_features": 0}
    issued_at = datetime.now(UTC).replace(microsecond=0).isoformat()
    weather_by_station: dict[str, dict] = {}
    weather_count = 0
    if settings.openweather_api_key:
        for station in selected:
            try:
                current = await openweather.get_weather(
                    float(station["lat"]), float(station["lon"])
                )
                weather_by_station[str(station["id"])] = current
                supabase_client.upsert_weather_observation(
                    {
                        "station_id": station["id"],
                        "recorded_at": issued_at,
                        "temperature": current["temp"],
                        "humidity": current["humidity"],
                        "wind_speed": current["wind_speed"],
                        "wind_deg": current["wind_deg"],
                        "rain_mm": current.get("rain_mm", 0),
                    }
                )
                forecasts = await openweather.get_forecast(
                    float(station["lat"]), float(station["lon"])
                )
                supabase_client.upsert_weather_forecasts(
                    [
                        {"station_id": station["id"], "issued_at": issued_at, **row}
                        for row in forecasts
                    ]
                )
                weather_count += 1
            except Exception:
                continue

    fire_points = []
    if settings.firms_map_key:
        try:
            fire_points = await firms.get_fires(1)
        except Exception:
            fire_points = []
    fire_count = 0
    for station in selected:
        weighted_frp = 0.0
        hotspot_count = 0
        upwind_count = 0
        wind_deg = float(
            weather_by_station.get(str(station["id"]), {}).get("wind_deg") or 0
        )
        for fire in fire_points:
            distance = haversine_km(
                float(station["lat"]),
                float(station["lon"]),
                float(fire["lat"]),
                float(fire["lon"]),
            )
            age = capture_age_minutes(str(fire.get("acquired_at") or ""))
            if distance > 100 or age is None or age > 24 * 60:
                continue
            hotspot_count += 1
            weighted_frp += (
                float(fire.get("frp") or 0)
                * math.exp(-distance / 50)
                * math.exp(-age / 720)
            )
            bearing = _bearing(
                float(station["lat"]),
                float(station["lon"]),
                float(fire["lat"]),
                float(fire["lon"]),
            )
            if _angle_difference(bearing, wind_deg) <= 45:
                upwind_count += 1
        supabase_client.upsert_fire_feature(
            {
                "station_id": station["id"],
                "recorded_at": issued_at,
                "hotspot_count": hotspot_count,
                "weighted_frp": round(weighted_frp, 4),
                "upwind_hotspot_count": upwind_count,
            }
        )
        fire_count += 1
    return {
        "stations": len(selected),
        "weather": weather_count,
        "fire_features": fire_count,
    }
