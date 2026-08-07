import asyncio
from datetime import UTC, datetime

import httpx

from backend.services import openmeteo_air, openweather_air


class _Response:
    def __init__(self, payload):
        self.payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self.payload


def test_openweather_air_normalizes_pm25(monkeypatch):
    monkeypatch.setattr(openweather_air.settings, "openweather_air_enabled", True)
    monkeypatch.setattr(openweather_air.settings, "openweather_api_key", "test")

    async def fake_get(*_args, **_kwargs):
        return _Response(
            {"list": [{"dt": 1_800_000_000, "components": {"pm2_5": 12.5}}]}
        )

    monkeypatch.setattr(httpx.AsyncClient, "get", fake_get)
    rows = asyncio.run(openweather_air.get_forecast(13.7, 100.5))
    assert rows[0]["pm25"] == 12.5
    assert datetime.fromisoformat(rows[0]["forecast_at"]).tzinfo == UTC


def test_openmeteo_air_maps_batch_results_to_station_ids(monkeypatch):
    monkeypatch.setattr(openmeteo_air.settings, "openmeteo_air_enabled", True)

    async def fake_get(*_args, **_kwargs):
        return _Response(
            [
                {"hourly": {"time": ["2026-08-04T01:00"], "pm2_5": [10]}},
                {"hourly": {"time": ["2026-08-04T01:00"], "pm2_5": [20]}},
            ]
        )

    monkeypatch.setattr(httpx.AsyncClient, "get", fake_get)
    result = asyncio.run(
        openmeteo_air.get_forecasts(
            [
                {"id": "a", "lat": 13, "lon": 100},
                {"id": "b", "lat": 14, "lon": 101},
            ]
        )
    )
    assert result["a"][0]["pm25"] == 10
    assert result["b"][0]["pm25"] == 20
