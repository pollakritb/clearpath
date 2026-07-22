from datetime import UTC, datetime, timedelta

import pytest

from backend.algorithms.forecast import forecast_pm25


def readings(values):
    start = datetime(2026, 7, 15, tzinfo=UTC)
    return [
        {"recorded_at": (start + timedelta(hours=i)).isoformat(), "pm25": value}
        for i, value in enumerate(values)
    ]


def test_forecast_flat_series_is_persistence():
    result = forecast_pm25(readings([20, 20, 20, 20]), 6)
    assert len(result["points"]) == 6
    assert all(point["pm25"] == 20 for point in result["points"])


def test_forecast_rising_series_damps_trend():
    result = forecast_pm25(readings([10, 12, 14, 16]), 4)
    predictions = [point["pm25"] for point in result["points"]]
    assert predictions[0] > 16
    assert predictions == sorted(predictions)
    assert result["points"][-1]["upper"] > result["points"][-1]["lower"]


def test_forecast_requires_data():
    with pytest.raises(ValueError):
        forecast_pm25([], 12)
