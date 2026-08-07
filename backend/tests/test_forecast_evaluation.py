from datetime import UTC, datetime, timedelta

from backend.algorithms.forecast_evaluation import (
    ROLLING_SPLIT_STRATEGY,
    model_card,
    rolling_origin_plan,
    sliced_metrics,
    station_holdout_plans,
)


def _records(stations=3, rows=120):
    start = datetime(2026, 1, 1, tzinfo=UTC)
    return [
        {
            "station_id": chr(65 + station),
            "district": f"D{station}",
            "prediction_at": (start + timedelta(hours=index)).isoformat(),
            "target_at": (start + timedelta(hours=index + 3)).isoformat(),
            "target": float(20 + station + index % 5),
        }
        for station in range(stations)
        for index in range(rows)
    ]


def test_rolling_plan_is_expanding_and_keeps_untouched_holdout():
    records = _records()
    plan = rolling_origin_plan(records, fold_count=4, minimum_train_rows=48)
    assert plan["strategy"] == ROLLING_SPLIT_STRATEGY
    assert plan["fold_count"] == 4
    assert plan["station_count"] == 3
    assert not (set(plan["development_indices"]) & set(plan["holdout_indices"]))
    previous_train_size = 0
    for fold in plan["folds"]:
        assert len(fold["train_indices"]) > previous_train_size
        previous_train_size = len(fold["train_indices"])
        assert not (set(fold["train_indices"]) & set(fold["validation_indices"]))
        first_validation = records[fold["validation_indices"][0]]["prediction_at"]
        assert all(
            records[index]["target_at"] <= first_validation
            for index in fold["train_indices"]
        )


def test_station_holdout_never_trains_on_held_station():
    records = _records(stations=2, rows=5)
    plans = station_holdout_plans(records)
    first = plans[0]
    assert all(
        records[index]["station_id"] != first["held_out_station"]
        for index in first["train_indices"]
    )
    assert all(
        records[index]["station_id"] == first["held_out_station"]
        for index in first["test_indices"]
    )


def test_sliced_metrics_include_station_district_season_and_pm_band():
    records = _records(stations=1, rows=3)
    metrics = sliced_metrics(records, [20, 20, 20])
    assert "all:all" in metrics
    assert "station:A" in metrics
    assert "district:D0" in metrics
    assert "season:dry" in metrics
    assert "pm_band:low" in metrics


def test_model_card_is_deterministically_hashed_and_requires_approval():
    kwargs = {
        "model_name": "clearpath-xgboost",
        "version": "v1",
        "horizon_hours": 1,
        "feature_version": "forecast-features-v2",
        "dataset_manifest_sha256": "a" * 64,
        "split_plan": {"strategy": ROLLING_SPLIT_STRATEGY, "fold_count": 4},
        "metrics": {"mae": 5},
        "limitations": ["staging only"],
    }
    first = model_card(**kwargs)
    second = model_card(**kwargs)
    assert first["model_card_sha256"] == second["model_card_sha256"]
    assert first["human_approval_required"] is True
