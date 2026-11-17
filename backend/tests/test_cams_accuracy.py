from backend.algorithms.cams_accuracy import (
    aggregate,
)
from backend.algorithms.forecast_validation import forecast_rows_status


def test_survey_shared_grid_and_missing_grid():
    assert forecast_rows_status([], 24) == "no_future_pm25"
    assert (
        forecast_rows_status([{"forecast_at": "2026-10-15T01:00:00Z"}], 24)
        == "partial_horizon"
    )
    assert (
        forecast_rows_status(
            [{"forecast_at": "2026-10-15T01:00:00Z"}],
            1,
            [{"forecast_at": "2026-10-15T01:00:00Z"}] * 2,
        )
        == "duplicate_provider_valid_at"
    )


def test_metrics_keep_duplicate_valid_hour_snapshots_but_count_distinct_hours():
    rows = [
        {"station_id": "103t", "valid_at": "v", "prediction": 20, "observed_pm25": 30},
        {"station_id": "103t", "valid_at": "v", "prediction": 40, "observed_pm25": 30},
    ]
    result = aggregate(rows)
    assert result["count"] == 2
    assert result["distinct_station_hours"] == 1
    assert result["mae"] == 10
    assert result["bias"] == 0
