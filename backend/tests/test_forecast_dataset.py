from datetime import UTC, datetime, timedelta

from backend.algorithms.forecast_dataset import (
    join_hourly_sources,
    latest_issued_forecast,
)

BASE = datetime(2026, 1, 1, tzinfo=UTC)


def _time(hour):
    return (BASE + timedelta(hours=hour)).isoformat()


def test_latest_forecast_rejects_future_issue_and_uses_latest_available_issue():
    forecasts = [
        {
            "station_id": "A",
            "issued_at": _time(0),
            "forecast_at": _time(3),
            "temperature": 20,
        },
        {
            "station_id": "A",
            "issued_at": _time(1),
            "forecast_at": _time(3),
            "temperature": 21,
        },
        {
            "station_id": "A",
            "issued_at": _time(2),
            "forecast_at": _time(3),
            "temperature": 99,
        },
    ]
    selected = latest_issued_forecast(
        forecasts,
        station_id="A",
        prediction_at=_time(1),
        target_at=_time(3),
    )
    assert selected["temperature"] == 21


def test_join_distinguishes_real_zero_from_missing_source():
    joined = join_hourly_sources(
        [
            {"station_id": "A", "recorded_at": _time(1), "pm25": 20},
            {"station_id": "A", "recorded_at": _time(2), "pm25": 21},
        ],
        [
            {
                "station_id": "A",
                "recorded_at": _time(1),
                "temperature": 30,
            }
        ],
        [
            {
                "station_id": "A",
                "recorded_at": _time(1),
                "hotspot_count": 0,
                "weighted_frp": 0,
                "upwind_hotspot_count": 0,
            }
        ],
        [],
        station_metadata={"A": {"lat": 13.8, "lon": 100.0}},
    )
    assert joined[0]["fire_status"] == "observed"
    assert joined[0]["hotspot_count"] == 0
    assert joined[1]["fire_status"] == "missing"
    assert joined[1]["hotspot_count"] is None
    assert joined[0]["station_lat"] == 13.8
