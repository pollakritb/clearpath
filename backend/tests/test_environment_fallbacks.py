from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta

import httpx

from backend.core.errors import ConfigurationError, UpstreamError
from backend.services import fire_feed, openmeteo_weather, weather_service


class _Response:
    def __init__(self, payload: dict):
        self.payload = payload

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict:
        return self.payload


def test_openmeteo_weather_normalizes_current_conditions(monkeypatch):
    captured: dict = {}

    async def fake_get(_client, url, *, params):
        captured.update({"url": url, "params": params})
        return _Response(
            {
                "current": {
                    "temperature_2m": 30.4,
                    "relative_humidity_2m": 71,
                    "precipitation": 0.2,
                    "weather_code": 61,
                    "wind_speed_10m": 2.7,
                    "wind_direction_10m": 190,
                }
            }
        )

    monkeypatch.setattr(httpx.AsyncClient, "get", fake_get)
    result = asyncio.run(openmeteo_weather.get_weather(13.8, 100.1))

    assert result == {
        "temp": 30.4,
        "humidity": 71.0,
        "wind_speed": 2.7,
        "wind_deg": 190.0,
        "description": "ฝนตก",
        "icon": None,
        "rain_mm": 0.2,
        "source": "open_meteo",
    }
    assert captured["url"] == openmeteo_weather.URL
    assert captured["params"]["wind_speed_unit"] == "ms"


def test_weather_service_falls_back_when_openweather_is_not_configured(monkeypatch):
    async def missing_key(_lat: float, _lon: float):
        raise ConfigurationError("missing key")

    async def free_weather(_lat: float, _lon: float):
        return {"source": "open_meteo", "temp": 29.0}

    monkeypatch.setattr(weather_service.openweather, "get_weather", missing_key)
    monkeypatch.setattr(weather_service.openmeteo_weather, "get_weather", free_weather)

    result = asyncio.run(weather_service.get_weather(13.8, 100.1))
    assert result == {"source": "open_meteo", "temp": 29.0}


def test_weather_service_marks_primary_provider(monkeypatch):
    async def primary_weather(_lat: float, _lon: float):
        return {"temp": 31.0}

    monkeypatch.setattr(weather_service.openweather, "get_weather", primary_weather)
    result = asyncio.run(weather_service.get_weather(13.8, 100.1))
    assert result == {"temp": 31.0, "source": "openweather"}


def test_fire_feed_reports_unconfigured_without_raising(monkeypatch):
    async def missing_key(_days: int):
        raise ConfigurationError("missing key")

    monkeypatch.setattr(fire_feed.firms, "get_fires", missing_key)
    result = asyncio.run(fire_feed.get_public_fires(1))

    assert result.fires == []
    assert result.available is False
    assert result.status == "unconfigured"
    assert result.message is not None
    assert "NASA FIRMS" in result.message


def test_fire_feed_reports_upstream_outage_without_false_clear(monkeypatch):
    async def upstream_outage(_days: int):
        raise UpstreamError("temporary")

    monkeypatch.setattr(fire_feed.firms, "get_fires", upstream_outage)
    result = asyncio.run(fire_feed.get_public_fires(1))

    assert result.fires == []
    assert result.available is False
    assert result.status == "unavailable"
    assert "ขัดข้อง" in (result.message or "")


def test_fire_feed_distinguishes_positive_clear_and_stale(monkeypatch):
    now = datetime(2026, 9, 16, 12, tzinfo=UTC)

    async def fresh(_days: int):
        return [
            {
                "lat": 13.82,
                "lon": 100.06,
                "frp": 10,
                "acquired_at": (now - timedelta(hours=1)).isoformat(),
                "satellite": "VIIRS",
            }
        ]

    monkeypatch.setattr(fire_feed.firms, "get_fires", fresh)
    positive = asyncio.run(fire_feed.get_public_fires(1, now=now))
    assert positive.status == "available"
    assert positive.available is True
    assert len(positive.fires) == 1

    async def empty(_days: int):
        return []

    monkeypatch.setattr(fire_feed.firms, "get_fires", empty)
    clear = asyncio.run(fire_feed.get_public_fires(1, now=now))
    assert clear.status == "checked_no_hotspots"
    assert clear.fires == []

    async def stale(_days: int):
        return [
            {
                "lat": 13.82,
                "lon": 100.06,
                "frp": 10,
                "acquired_at": (now - timedelta(hours=13)).isoformat(),
                "satellite": "VIIRS",
            }
        ]

    monkeypatch.setattr(fire_feed.firms, "get_fires", stale)
    stale_feed = asyncio.run(fire_feed.get_public_fires(1, now=now))
    assert stale_feed.status == "stale"
    assert stale_feed.fires == []
    assert stale_feed.latest_acquired_at == (now - timedelta(hours=13)).isoformat()
