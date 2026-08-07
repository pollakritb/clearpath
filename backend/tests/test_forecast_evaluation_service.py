from backend.services import forecast_evaluation


def _settled_row(station_id: str, *, error: float) -> dict:
    return {
        "run_id": f"run-{station_id}",
        "horizon_hours": 3,
        "forecast_at": "2026-08-01T03:00:00+00:00",
        "method": "xgboost-shadow-v2",
        "absolute_error": abs(error),
        "squared_error": error**2,
        "signed_error": error,
        "category_correct": True,
        "false_safe": False,
        "interval_covered": True,
        "interval_width": 10,
        "forecast_runs": {
            "station_id": station_id,
            "district": "เมืองนครปฐม",
            "environment": "production",
            "fallback_reason": "ml_forecast_disabled",
            "latency_ms": 125,
        },
    }


def test_daily_aggregation_emits_station_district_and_global_slices(monkeypatch):
    persisted = []
    monkeypatch.setattr(
        forecast_evaluation.supabase_client,
        "list_settled_forecast_predictions",
        lambda _since: [_settled_row("81t", error=2), _settled_row("82t", error=4)],
    )
    monkeypatch.setattr(
        forecast_evaluation.supabase_client,
        "upsert_forecast_evaluation",
        lambda rows: persisted.extend(rows),
    )

    result = forecast_evaluation.aggregate_recent()

    assert result == {"source_rows": 2, "aggregate_rows": 4}
    district = next(
        row
        for row in persisted
        if row["station_id"] == "all" and row["district"] == "เมืองนครปฐม"
    )
    assert district["rows"] == 2
    assert district["mae"] == 3
    # A successful shadow row must not inherit the served baseline fallback.
    assert district["fallback_rate"] == 0
    assert any(
        row["station_id"] == "all" and row["district"] == "all" for row in persisted
    )


def test_monitoring_alerts_compare_global_candidate_with_baseline():
    shared = {
        "environment": "production",
        "horizon_hours": 3,
        "station_id": "all",
        "district": "all",
        "rows": 100,
        "bias": 1,
        "false_safe_rate": 0.01,
        "interval_coverage": 0.9,
        "fallback_rate": 0,
        "p95_latency_ms": 100,
    }
    weekly = {
        "rows": [
            {**shared, "method": "xgboost-shadow-v2", "mae": 12},
            {**shared, "method": "damped-local-trend-v1", "mae": 10},
        ]
    }

    result = forecast_evaluation.monitoring_alerts(
        {"due": 0, "observation_missing": 0}, weekly, {"alert_codes": []}
    )

    assert result["alert_codes"] == ["forecast_accuracy_worse_than_baseline"]
