from backend.algorithms.cams_accuracy import (
    aggregate,
    candidate_predictions,
    held_out_comparison,
)
from backend.algorithms.forecast_validation import forecast_rows_status, survey_summary


def _pair(
    station, valid, fetched, observation_fetched, forecast, actual, lat=13.8, lon=100.1
):
    return {
        "station_id": station,
        "valid_at": valid,
        "fetched_at": fetched,
        "observation_fetched_at": observation_fetched,
        "forecast_pm25": forecast,
        "observed_pm25": actual,
        "error": forecast - actual,
        "requested_lat": lat,
        "requested_lon": lon,
    }


def test_survey_shared_grid_and_missing_grid():
    rows = [
        {
            "station_id": "103t",
            "requested_lat": 13.8,
            "requested_lon": 100.1,
            "grid_lat": 13.9,
            "grid_lon": 100.2,
        },
        {
            "station_id": "other",
            "requested_lat": 13.7,
            "requested_lon": 100.2,
            "grid_lat": 13.9,
            "grid_lon": 100.2,
        },
        {
            "station_id": "missing",
            "requested_lat": None,
            "requested_lon": None,
            "reason": "invalid_station_coordinates",
        },
    ]
    result = survey_summary(rows)
    assert result["station_count"] == 3
    assert result["unique_grid_count"] == 1
    assert result["shared_grids"] == [["103t", "other"]]
    assert result["anomalies"][0]["reason"] == "invalid_station_coordinates"
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


def test_correction_uses_only_prior_known_observations_and_no_station_leakage():
    history = [
        _pair(
            "103t",
            "2026-10-01T00:00:00Z",
            "2026-09-30T18:00:00Z",
            "2026-10-01T01:00:00Z",
            30,
            20,
        )
    ]
    target = _pair(
        "103t",
        "2026-10-02T12:00:00Z",
        "2026-10-02T06:00:00Z",
        "2026-10-02T13:00:00Z",
        35,
        25,
    )
    assert candidate_predictions(target, history)["persistence"] == 20
    assert (
        candidate_predictions(target, history, held_out_station=True)["persistence"]
        is None
    )
    late = [{**history[0], "observation_fetched_at": "2026-10-02T07:00:00Z"}]
    assert candidate_predictions(target, late)["persistence"] is None
    comparison = held_out_comparison(
        history + [target], "2026-10-02T00:00:00Z", {"103t"}
    )
    assert comparison["held_out_stations"]["metrics"]["raw"]["count"] == 1
