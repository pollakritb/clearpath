from backend.algorithms.forecast_monitoring import (
    aggregate_settled,
    canary_eligible,
    evaluate_shadow_gate,
    evaluation_alert_codes,
    missingness_drift,
    population_stability_index,
    reconciliation_alert_codes,
    settle_prediction,
)


def test_settlement_computes_safety_and_interval_metrics():
    result = settle_prediction({"pm25": 20, "lower": 10, "upper": 30}, 50)
    assert result["absolute_error"] == 30
    assert result["false_safe"] is True
    assert result["interval_covered"] is False
    metrics = aggregate_settled([result])
    assert metrics["mae"] == 30
    assert metrics["false_safe_rate"] == 1


def test_canary_assignment_is_deterministic_and_allowlist_wins():
    first = canary_eligible("station-a", percentage=10)
    assert canary_eligible("station-a", percentage=10) is first
    assert canary_eligible(
        "station-special", percentage=0, allowlist=["station-special"]
    )


def test_missingness_drift_reports_large_change():
    result = missingness_drift({"weather": 0.1}, {"weather": 0.4})
    assert result["drifted"] is True
    assert result["alert_features"] == ["weather"]


def test_population_stability_index_detects_prediction_shift():
    stable = population_stability_index(range(100), range(100))
    shifted = population_stability_index(range(100), range(100, 200))
    assert stable["drifted"] is False
    assert shifted["drifted"] is True


def test_population_stability_index_rejects_small_samples():
    try:
        population_stability_index([1, 2], [1, 2])
    except ValueError as exc:
        assert str(exc) == "drift_sample_insufficient"
    else:
        raise AssertionError("expected insufficient sample failure")


def test_shadow_gate_requires_duration_accuracy_safety_and_operations():
    passing = evaluate_shadow_gate(
        {"mae": 8, "false_safe_rate": 0.03, "interval_coverage": 0.9},
        {"mae": 10, "false_safe_rate": 0.03},
        {"fallback_rate": 0.05, "error_rate": 0.005},
        observed_days=14,
    )
    assert passing["passed"] is True
    assert (
        evaluate_shadow_gate(
            {"mae": 10, "false_safe_rate": 0.1, "interval_coverage": 0.7},
            {"mae": 10, "false_safe_rate": 0.03},
            {"fallback_rate": 0.2, "error_rate": 0.02},
            observed_days=7,
        )["passed"]
        is False
    )


def test_evaluation_alerts_require_samples_and_compare_baseline():
    assert evaluation_alert_codes({"rows": 5})["status"] == "insufficient_evidence"
    result = evaluation_alert_codes(
        {
            "rows": 100,
            "mae": 12,
            "bias": 12,
            "false_safe_rate": 0.08,
            "interval_coverage": 0.7,
            "fallback_rate": 0.2,
            "p95_latency_ms": 2500,
        },
        {"mae": 10},
    )
    assert "forecast_accuracy_worse_than_baseline" in result["alert_codes"]
    assert "forecast_false_safe_rate_high" in result["alert_codes"]


def test_evaluation_alerts_tolerate_nullable_operation_metrics():
    result = evaluation_alert_codes(
        {
            "rows": 50,
            "mae": 8,
            "bias": None,
            "false_safe_rate": None,
            "interval_coverage": None,
            "fallback_rate": None,
            "p95_latency_ms": None,
        }
    )
    assert result["status"] == "evaluated"
    assert result["alert_codes"] == ["forecast_evaluation_metric_missing"]


def test_reconciliation_alerts_cover_missing_invalid_and_no_station_cases():
    assert reconciliation_alert_codes(
        stations=0,
        expected_hours=100,
        missing_hours=30,
        invalid_rows=2,
    ) == [
        "forecast_ingestion_invalid_rows",
        "forecast_ingestion_missingness_high",
        "forecast_ingestion_no_stations",
    ]
    assert (
        reconciliation_alert_codes(
            stations=2,
            expected_hours=100,
            missing_hours=20,
            invalid_rows=0,
        )
        == []
    )
