from backend.algorithms.forecast_model import (
    evaluate_activation_gate,
    predict_neutral_artifact,
)


def test_activation_gate_requires_data_and_improvement():
    passing = {
        "history_days": 100,
        "source_rows": 2000,
        "test_rows": 400,
        "station_count": 4,
        "observed_months": 6,
        "split_strategy": "per_station_rolling_origin_with_untouched_holdout",
        "rolling_fold_count": 4,
        "untouched_holdout": True,
        "feature_version": "forecast-features-v2",
        "dataset_manifest_sha256": "a" * 64,
        "completeness": 0.9,
        "baseline_mae": 10,
        "model_mae": 9,
        "baseline_category_accuracy": 0.7,
        "model_category_accuracy": 0.72,
        "false_safe_gate_passed": True,
        "interval_coverage_target": 0.9,
        "interval_empirical_coverage": 0.88,
    }
    assert evaluate_activation_gate(passing)["active"] is True
    failing = {**passing, "model_mae": 9.8}
    assert evaluate_activation_gate(failing)["active"] is False

    leaked_split = {**passing, "split_strategy": "random"}
    assert (
        "rolling_origin_holdout_required"
        in evaluate_activation_gate(leaked_split)["reasons"]
    )


def test_neutral_tree_evaluator():
    artifact = {
        "base_score": 2,
        "trees": [
            {
                "nodeid": 0,
                "split": "x",
                "split_condition": 5,
                "yes": 1,
                "no": 2,
                "missing": 1,
                "children": [
                    {"nodeid": 1, "leaf": 3},
                    {"nodeid": 2, "leaf": 7},
                ],
            }
        ],
    }
    assert predict_neutral_artifact(artifact, {"x": 4}) == 5
    assert predict_neutral_artifact(artifact, {"x": 8}) == 9
    assert predict_neutral_artifact(artifact, {"x": float("nan")}) == 5
