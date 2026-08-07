from backend.algorithms.forecast_uncertainty import (
    apply_calibrated_interval,
    calibrate_residual_intervals,
    interval_metrics,
)


def _calibration_rows(count=40):
    return [
        {
            "actual": 20 + (index % 5),
            "predicted": 20,
            "horizon_hours": 1,
            "station_id": "A",
            "season": "dry",
        }
        for index in range(count)
    ]


def test_calibration_has_horizon_and_supported_slice_checksums():
    result = calibrate_residual_intervals(
        _calibration_rows(),
        version="cal-v1",
        minimum_slice_rows=30,
    )
    assert "horizon:1" in result["slices"]
    assert "horizon:1:station:A" in result["slices"]
    assert len(result["calibration_sha256"]) == 64


def test_apply_prefers_station_slice_and_widens_limited_quality():
    calibration = calibrate_residual_intervals(
        _calibration_rows(),
        version="cal-v1",
        minimum_slice_rows=30,
    )
    result = apply_calibrated_interval(
        20,
        calibration,
        horizon_hours=1,
        station_id="A",
        data_quality="limited",
    )
    assert result["calibration_slice"] == "horizon:1:station:A"
    assert result["upper"] - result["lower"] >= 10


def test_interval_metrics_report_coverage_and_width():
    metrics = interval_metrics([10, 20], [5, 21], [15, 25])
    assert metrics["empirical_coverage"] == 0.5
    assert metrics["mean_interval_width"] == 7
