"""Retired model collection cannot fetch providers or write removed storage."""

import asyncio

from backend.services import firms, forecast_data, openmeteo_weather, supabase_client


def test_retired_input_collection_has_no_provider_or_database_side_effects(monkeypatch):
    def forbidden(*_args, **_kwargs):
        raise AssertionError("retired model collection must perform no I/O")

    monkeypatch.setattr(supabase_client, "get_client", forbidden)
    monkeypatch.setattr(openmeteo_weather, "get_weather", forbidden)
    monkeypatch.setattr(firms, "get_fires", forbidden)
    result = asyncio.run(
        forecast_data.collect_forecast_inputs(
            [{"id": "station-1", "lat": 13.82, "lon": 100.06, "province": "นครปฐม"}]
        )
    )
    assert result["status"] == "retired"
    assert result["weather"] == result["fire_features"] == 0
