from datetime import UTC, datetime, timedelta

from backend.algorithms.forecast_quality import (
    audit_point_in_time_examples,
    build_dataset_manifest,
    detect_station_changes,
    evaluate_feature_value,
    evaluate_forecast_row,
    evaluate_inference_quality,
    lag_window_is_usable,
    validate_hourly_sequence,
)


def _row(hour: int, pm25: float = 20, **values):
    return {
        "station_id": values.pop("station_id", "A"),
        "recorded_at": (
            datetime(2026, 1, 1, tzinfo=UTC) + timedelta(hours=hour)
        ).isoformat(),
        "pm25": pm25,
        **values,
    }


def test_value_states_keep_real_zero_distinct_from_missing_and_unavailable():
    assert evaluate_feature_value("hotspot_count", 0)["state"] == "observed"
    assert evaluate_feature_value("rain_mm", None)["state"] == "missing"
    assert (
        evaluate_feature_value("rain_mm", None, source_status="unavailable")["state"]
        == "unavailable"
    )
    assert (
        evaluate_feature_value("rain_mm", None, source_status="not_applicable")["state"]
        == "not_applicable"
    )


def test_extreme_pm25_is_reviewed_but_not_silently_removed():
    high = evaluate_feature_value("pm25", 600)
    assert high["usable"] is True
    assert high["warnings"] == ["pm25_extreme_review"]
    assert evaluate_feature_value("pm25", -1)["usable"] is False


def test_row_quality_rejects_future_source_but_optional_missingness_is_explicit():
    row = _row(
        3,
        weather_status="unavailable",
        weather_source_at=_row(4)["recorded_at"],
    )
    result = evaluate_forecast_row(row)
    assert result["usable"] is False
    assert "weather_source_at_after_prediction_time" in result["reasons"]
    assert result["feature_states"]["temperature"] == "unavailable"


def test_lag_window_requires_contiguous_station_hours():
    rows = [_row(hour) for hour in range(25)]
    assert lag_window_is_usable(rows, 24, (1, 3, 6, 12, 24)) == (True, [])
    rows[23] = {**rows[23], "recorded_at": _row(22)["recorded_at"]}
    usable, reasons = lag_window_is_usable(rows, 24, (1,))
    assert usable is False
    assert reasons == ["lag_1_time_gap"]


def test_sequence_reports_duplicates_and_missing_hours():
    rows = [_row(0), _row(0), _row(2)]
    result = validate_hourly_sequence(rows)
    assert result["valid"] is False
    assert result["duplicate_hours"] == 1
    assert result["missing_hours"] == 1


def test_station_change_boundaries_are_detected():
    rows = [
        _row(0, lat=13.8, lon=100.0, device_id="old"),
        _row(1, lat=13.81, lon=100.01, device_id="new"),
    ]
    events = detect_station_changes(rows)
    assert events[0]["changes"] == ["device_changed", "station_relocated"]


def test_manifest_uses_raw_expected_station_hours_and_is_deterministic():
    rows = [_row(0), _row(1), _row(3)]
    usable = {
        ("A", int(datetime.fromisoformat(rows[0]["recorded_at"]).timestamp() // 3600))
    }
    first = build_dataset_manifest(
        rows,
        usable_keys=usable,
        excluded_reasons={"lag_gap": 2},
        feature_version="forecast-features-v2",
    )
    second = build_dataset_manifest(
        list(reversed(rows)),
        usable_keys=usable,
        excluded_reasons={"lag_gap": 2},
        feature_version="forecast-features-v2",
    )
    assert first["expected_station_hours"] == 4
    assert first["raw_completeness"] == 0.75
    assert first["usable_station_count"] == 1
    assert first["manifest_sha256"] == second["manifest_sha256"]


def test_point_in_time_audit_detects_future_feature_and_invalid_target():
    prediction = _row(2)["recorded_at"]
    result = audit_point_in_time_examples(
        [
            {
                "prediction_at": prediction,
                "target_at": _row(1)["recorded_at"],
                "feature_source_times": {"weather": _row(3)["recorded_at"]},
            }
        ]
    )
    assert result["passed"] is False
    assert {item["code"] for item in result["violations"]} == {
        "target_not_in_future",
        "feature_from_future",
    }


def test_inference_quality_requires_fresh_contiguous_history_and_preserves_zero():
    now = datetime(2026, 1, 2, tzinfo=UTC)
    history = [
        {
            "recorded_at": (now - timedelta(hours=24 - index)).isoformat(),
            "pm25": 0 if index == 24 else 20,
        }
        for index in range(25)
    ]
    quality = evaluate_inference_quality(
        history,
        {
            "weather_status": "unavailable",
            "fire_status": "observed",
            "hotspot_count": 0,
            "weighted_frp": 0,
            "upwind_hotspot_count": 0,
        },
        now=now,
    )
    assert quality["ml_eligible"] is True
    assert quality["source_points"] == 25
    assert quality["optional_feature_states"]["hotspot_count"] == "observed"
    assert quality["optional_feature_states"]["temperature"] == "unavailable"


def test_inference_quality_fails_closed_on_gap_and_stale_data():
    now = datetime(2026, 1, 3, tzinfo=UTC)
    history = [
        {
            "recorded_at": (now - timedelta(hours=30 - index)).isoformat(),
            "pm25": 20,
        }
        for index in range(25)
        if index != 10
    ]
    quality = evaluate_inference_quality(history, {}, now=now)
    assert quality["ml_eligible"] is False
    assert "latest_observation_stale" in quality["reason_codes"]
    assert "insufficient_pm25_history" in quality["reason_codes"]
