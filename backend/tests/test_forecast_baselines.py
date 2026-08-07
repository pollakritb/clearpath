from datetime import UTC, datetime, timedelta

import pytest

from backend.algorithms.forecast_baselines import (
    backtest_baselines,
    champion_baseline,
    damped_local_trend_forecast,
    diurnal_climatology_forecast,
    evaluate_predictions,
    persistence_forecast,
    seasonal_naive_forecast,
)


def _readings(values, *, start=None):
    start = start or datetime(2026, 1, 1, tzinfo=UTC)
    return [
        {"recorded_at": (start + timedelta(hours=index)).isoformat(), "pm25": value}
        for index, value in enumerate(values)
    ]


def test_persistence_is_flat_and_has_intervals():
    points = persistence_forecast(_readings([10, 20, 30]), 3)
    assert [point["pm25"] for point in points] == [30, 30, 30]
    assert all(point["lower"] <= point["pm25"] <= point["upper"] for point in points)


def test_damped_trend_handles_spike_without_unbounded_growth():
    points = damped_local_trend_forecast(_readings([20] * 20 + [200, 20, 20, 20]), 6)
    assert all(point["pm25"] >= 0 for point in points)
    assert points[-1]["pm25"] < 100


def test_seasonal_naive_uses_previous_day_when_available():
    values = [float(index) for index in range(48)]
    points = seasonal_naive_forecast(_readings(values), 1)
    assert points[0]["pm25"] == 24


def test_diurnal_climatology_uses_bangkok_local_hour():
    start = datetime(2026, 1, 1, tzinfo=UTC)
    values = [10.0] * 24 + [30.0] * 24
    points = diurnal_climatology_forecast(_readings(values, start=start), 1)
    assert points[0]["pm25"] == 20


def test_baselines_require_usable_data():
    with pytest.raises(ValueError, match="no_usable_readings"):
        persistence_forecast([], 1)


def test_evaluation_uses_central_categories_and_false_safe_rate():
    metrics = evaluate_predictions([10, 80], [12, 20])
    assert metrics["category_accuracy"] == 0.5
    assert metrics["false_safe_rate"] == 0.5
    assert metrics["mae"] == 31


def test_champion_uses_mae_then_false_safe_tie_break():
    assert (
        champion_baseline(
            {
                "persistence": {"mae": 5, "false_safe_rate": 0.2},
                "seasonal_naive": {"mae": 5, "false_safe_rate": 0.1},
            }
        )
        == "seasonal_naive"
    )


def test_walk_forward_backtest_compares_all_baselines_without_future_rows():
    result = backtest_baselines(_readings([20 + index % 24 for index in range(80)]), 3)
    assert result["rows"] > 0
    assert set(result["metrics"]) == {
        "persistence",
        "seasonal_naive",
        "damped_local_trend",
        "diurnal_climatology",
    }
    assert result["champion"] in result["metrics"]
