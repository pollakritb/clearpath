import math
from datetime import UTC, datetime, timedelta

from backend.algorithms.forecast_features import (
    FEATURE_VERSION,
    feature_vector,
    spatial_context,
    training_records,
)


def _rows(hours: int, **overrides):
    start = datetime(2026, 1, 1, tzinfo=UTC)
    return [
        {
            "station_id": "A",
            "recorded_at": (start + timedelta(hours=index)).isoformat(),
            "pm25": 10 + index,
            **overrides,
        }
        for index in range(hours)
    ]


def test_feature_v2_uses_bangkok_time_and_explicit_missingness():
    rows = _rows(25, hotspot_count=0, fire_status="observed")
    features = feature_vector(rows, 24, horizon_hours=1)
    assert FEATURE_VERSION == "forecast-features-v2"
    assert features["pm25_current"] == 34
    assert features["hotspot_count"] == 0
    assert features["hotspot_count_missing"] == 0
    assert math.isnan(features["temperature"])
    assert features["temperature_missing"] == 1
    # 2026-01-02 00:00 UTC is 07:00 in Bangkok.
    assert math.isclose(features["hour_sin"], math.sin(2 * math.pi * 7 / 24))


def test_optional_long_lags_are_nan_but_required_24_hours_are_enforced():
    rows = _rows(25)
    features = feature_vector(rows, 24)
    assert math.isnan(features["pm25_lag_48"])
    assert features["pm25_lag_48_missing"] == 1
    rows[23]["recorded_at"] = rows[22]["recorded_at"]
    try:
        feature_vector(rows, 24)
    except ValueError as exc:
        assert str(exc) == "required_pm25_gap"
    else:
        raise AssertionError("gap was accepted")


def test_training_records_match_targets_by_timestamp_not_row_offset():
    rows = _rows(30)
    records, excluded = training_records(rows, 3)
    assert records[0]["prediction_at"] == rows[24]["recorded_at"]
    assert records[0]["target_at"] == rows[27]["recorded_at"]
    assert records[0]["target"] == rows[27]["pm25"]
    assert records[0]["persistence"] == rows[24]["pm25"]
    assert excluded["target_missing"] == 3


def test_spatial_context_uses_haversine_nearest_station():
    context = spatial_context(
        "A",
        [
            {"station_id": "A", "lat": 13.8, "lon": 100.0, "pm25": 20},
            {"station_id": "B", "lat": 13.81, "lon": 100.0, "pm25": 30},
            {"station_id": "C", "lat": 14.0, "lon": 100.0, "pm25": 50},
        ],
    )
    assert context["nearest_station_pm25"] == 30
    assert context["nearest_station_distance_km"] < 2
    assert context["regional_pm25_median"] == 30
