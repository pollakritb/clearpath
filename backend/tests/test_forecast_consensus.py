from backend.algorithms.forecast_consensus import (
    build_consensus,
    effective_sample_size,
    provider_accuracy_weight,
    report_quality_weight,
    weighted_median,
)


def test_weighted_median_is_robust_to_low_weight_outlier():
    assert weighted_median([(20, 1), (22, 1), (200, 0.1)]) == 22


def test_effective_sample_size_penalizes_concentrated_weight():
    assert effective_sample_size([1, 1]) == 2
    assert effective_sample_size([1, 0.01]) < 1.1


def test_provider_accuracy_bootstraps_then_penalizes_false_safe():
    assert (
        provider_accuracy_weight(
            mae=9, false_safe_rate=0.2, evaluation_count=299, station_count=10
        )
        == 1
    )
    safer = provider_accuracy_weight(
        mae=9, false_safe_rate=0.0, evaluation_count=300, station_count=3
    )
    unsafe = provider_accuracy_weight(
        mae=9, false_safe_rate=0.5, evaluation_count=300, station_count=3
    )
    assert safer > unsafe


def test_averaging_period_changes_community_quality_weight():
    base = {
        "trust_score": 80,
        "age_minutes": 10,
        "gps_accuracy_m": 20,
        "device_calibrated": False,
    }
    assert report_quality_weight(
        {**base, "averaging_period": "5_minutes"}
    ) > report_quality_weight({**base, "averaging_period": "instant"})


def test_consensus_exposes_provider_agreement_and_community_provenance():
    result = build_consensus(
        provider_points=[
            {"source": "clearpath", "pm25": 30, "lower": 22, "upper": 38},
            {"source": "openweather", "pm25": 33, "lower": 25, "upper": 41},
            {"source": "cams", "pm25": 32, "lower": 24, "upper": 40},
        ],
        horizon_hours=1,
        station_lat=13.75,
        station_lon=100.5,
        community_reports=[
            {
                "id": "a",
                "lat": 13.751,
                "lon": 100.501,
                "pm25": 45,
                "trust_score": 90,
                "age_minutes": 10,
                "gps_accuracy_m": 20,
                "device_calibrated": True,
                "averaging_period": "5_minutes",
            },
            {
                "id": "b",
                "lat": 13.752,
                "lon": 100.502,
                "pm25": 44,
                "trust_score": 85,
                "age_minutes": 15,
                "gps_accuracy_m": 30,
                "averaging_period": "5_minutes",
            },
        ],
    )
    assert result["agreement"] == "high"
    assert result["provider_count"] == 3
    assert result["community_report_count"] == 2
    assert result["community_report_ids"] == ["a", "b"]
    assert result["lower"] <= result["pm25"] <= result["upper"]


def test_strong_corroborated_community_can_change_consensus_without_a_hard_cap():
    community = [
        {
            "id": str(index),
            "lat": 13.75,
            "lon": 100.5,
            "pm25": 80,
            "trust_score": 100,
            "age_minutes": 0,
            "gps_accuracy_m": 10,
            "device_calibrated": True,
            "averaging_period": "5_minutes",
        }
        for index in range(8)
    ]
    result = build_consensus(
        provider_points=[
            {"pm25": 30, "weight": 1},
            {"pm25": 31, "weight": 1},
            {"pm25": 32, "weight": 1},
        ],
        horizon_hours=1,
        station_lat=13.75,
        station_lon=100.5,
        community_reports=community,
    )
    assert result["pm25"] > 32


def test_consensus_uses_point_estimate_when_provider_interval_is_null():
    result = build_consensus(
        provider_points=[
            {"source": "clearpath", "pm25": 18, "lower": 12, "upper": 24},
            {"source": "openmeteo_cams", "pm25": 20, "lower": None, "upper": None},
        ],
        horizon_hours=3,
        station_lat=13.82,
        station_lon=100.06,
    )

    assert result["provider_count"] == 2
    assert result["lower"] <= result["pm25"] <= result["upper"]
