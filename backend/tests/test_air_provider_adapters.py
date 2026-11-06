import asyncio

import httpx

from backend.services import openmeteo_air


class _Response:
    def __init__(self, payload):
        self.payload = payload
        self.status_code = 200
        self.headers = {}
        self.request = httpx.Request("GET", "https://provider.test")

    def raise_for_status(self):
        return None

    def json(self):
        return self.payload


def test_openmeteo_air_maps_batch_results_to_station_ids(monkeypatch):
    monkeypatch.setattr(openmeteo_air.settings, "openmeteo_air_enabled", True)
    requested = []

    async def fake_get(*_args, **kwargs):
        requested.append(kwargs.get("params", {}))
        return _Response(
            [
                {
                    "latitude": 13,
                    "longitude": 100,
                    "hourly": {"time": ["2026-08-04T01:00"], "pm2_5": [10]},
                },
                {
                    "latitude": 14,
                    "longitude": 101,
                    "hourly": {"time": ["2026-08-04T01:00"], "pm2_5": [20]},
                },
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
    assert requested[0]["domains"] == "cams_global"
    assert result["a"][0]["requested_lat"] == 13
    assert result["a"][0]["source_lat"] == 13
    assert result["a"][0]["valid_at"] == "2026-08-04T01:00:00+00:00"
