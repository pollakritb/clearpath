import asyncio
from datetime import UTC, datetime, timedelta

from backend.algorithms.forecast_horizon import forecast_horizon
from backend.services import openmeteo_grid

NOW = datetime(2026, 11, 6, 6, 55, tzinfo=UTC)


def times(start, n=120):
    return [(start + timedelta(hours=i)).isoformat() for i in range(n)]


def test_past_midnight_hours_do_not_count_as_future():
    result = forecast_horizon(times(datetime(2026, 11, 5, tzinfo=UTC)), NOW)
    assert result["past_time_count"] == 30 and result["future_time_count"] == 90
    assert result["future_horizon_hours"] == 88.1
    assert result["coverage_status"] == "partial"


def test_contiguous_rolling_coverage_and_missing_hours():
    anchor = NOW.replace(minute=0)
    result = forecast_horizon(times(anchor), NOW)
    assert result["coverage_status"] == "complete"
    assert (
        forecast_horizon(times(anchor)[:5] + times(anchor)[6:], NOW)["coverage_status"]
        == "partial"
    )
    assert (
        forecast_horizon(["invalid", "2020-01-01T00:00"], NOW)["coverage_status"]
        == "unavailable"
    )


def test_grid_adapter_pins_explicit_window_across_checkpoints(monkeypatch):
    calls = []

    async def get(client, url, *, params):
        calls.append(params)
        return {
            "latitude": 13.6,
            "longitude": 100,
            "hourly_units": {"pm2_5": "µg/m³"},
            "hourly": {"time": ["2026-11-06T06:00"], "pm2_5": [10]},
        }

    monkeypatch.setattr(openmeteo_grid, "get_json", get)
    points = [{"lat": 13.6, "lon": 100, "index": 0}]
    asyncio.run(
        openmeteo_grid.fetch_batch(points, start_at="2026-11-06T06:00:00+00:00")
    )
    assert calls[0]["start_hour"] == "2026-11-06T06:00"
    assert calls[0]["end_hour"] == "2026-11-11T05:00"
    assert "forecast_days" not in calls[0]
