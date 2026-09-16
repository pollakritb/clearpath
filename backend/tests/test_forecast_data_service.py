from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta

from backend.core.config import settings
from backend.services import forecast_data


def test_forecast_input_collection_short_circuits_outside_service_area():
    result = asyncio.run(
        forecast_data.collect_forecast_inputs(
            [{"id": "north", "lat": 18.8, "lon": 98.9, "province": "Chiang Mai"}]
        )
    )
    assert result == {"stations": 0, "weather": 0, "fire_features": 0}


def test_forecast_input_collection_persists_weather_and_wind_aware_fire_features(
    monkeypatch,
):
    monkeypatch.setattr(settings, "openweather_api_key", "weather-key")
    monkeypatch.setattr(settings, "firms_map_key", "firms-key")
    stations = [
        {"id": "station-1", "lat": 13.82, "lon": 100.06, "province": None},
        {"id": "station-2", "lat": 13.75, "lon": 100.0, "province": None},
        {"id": "outside", "lat": 18.8, "lon": 98.9, "province": None},
    ]
    weather_rows: list[dict] = []
    forecast_rows: list[dict] = []
    fire_rows: list[dict] = []

    async def weather(lat: float, _lon: float):
        if lat == 13.75:
            raise RuntimeError("weather unavailable")
        return {
            "temp": 30,
            "humidity": 70,
            "wind_speed": 2,
            "wind_deg": 0,
            "rain_mm": 1,
        }

    async def forecasts(_lat: float, _lon: float):
        return [{"forecast_at": "2026-09-16T03:00:00Z", "temp": 31}]

    async def fires(_days: int):
        now = datetime.now(UTC)
        return [
            {
                "lat": 13.9,
                "lon": 100.06,
                "frp": 20,
                "acquired_at": (now - timedelta(hours=1)).isoformat(),
            },
            {
                "lat": 18.8,
                "lon": 98.9,
                "frp": 100,
                "acquired_at": now.isoformat(),
            },
            {
                "lat": 13.9,
                "lon": 100.06,
                "frp": 100,
                "acquired_at": (now - timedelta(hours=25)).isoformat(),
            },
        ]

    monkeypatch.setattr(forecast_data.openweather, "get_weather", weather)
    monkeypatch.setattr(forecast_data.openweather, "get_forecast", forecasts)
    monkeypatch.setattr(forecast_data.firms, "get_fires", fires)
    monkeypatch.setattr(
        forecast_data.supabase_client,
        "upsert_weather_observation",
        lambda row: weather_rows.append(row),
    )
    monkeypatch.setattr(
        forecast_data.supabase_client,
        "upsert_weather_forecasts",
        lambda rows: forecast_rows.extend(rows),
    )
    monkeypatch.setattr(
        forecast_data.supabase_client,
        "upsert_fire_feature",
        lambda row: fire_rows.append(row),
    )

    result = asyncio.run(forecast_data.collect_forecast_inputs(stations))

    assert result == {"stations": 2, "weather": 1, "fire_features": 2}
    assert weather_rows[0]["station_id"] == "station-1"
    assert forecast_rows[0]["station_id"] == "station-1"
    assert len(fire_rows) == 2
    assert fire_rows[0]["hotspot_count"] == 1
    assert fire_rows[0]["upwind_hotspot_count"] == 1
    assert fire_rows[0]["weighted_frp"] > 0


def test_forecast_input_collection_survives_optional_firms_failure(monkeypatch):
    monkeypatch.setattr(settings, "openweather_api_key", "")
    monkeypatch.setattr(settings, "firms_map_key", "firms-key")

    async def failed(_days: int):
        raise RuntimeError("FIRMS unavailable")

    rows: list[dict] = []
    monkeypatch.setattr(forecast_data.firms, "get_fires", failed)
    monkeypatch.setattr(
        forecast_data.supabase_client,
        "upsert_fire_feature",
        lambda row: rows.append(row),
    )
    result = asyncio.run(
        forecast_data.collect_forecast_inputs(
            [{"id": "station-1", "lat": 13.82, "lon": 100.06, "province": None}]
        )
    )
    assert result == {"stations": 1, "weather": 0, "fire_features": 1}
    assert rows[0]["hotspot_count"] == 0
