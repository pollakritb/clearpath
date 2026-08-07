"""Pure production evaluator and activation gate for offline-trained models."""

from __future__ import annotations

import math
from collections.abc import Mapping

from .forecast_evaluation import ROLLING_SPLIT_STRATEGY


def evaluate_activation_gate(metrics: Mapping[str, object]) -> dict:
    reasons: list[str] = []
    if float(metrics.get("history_days", 0)) < 90:
        reasons.append("history_days_below_90")
    if int(metrics.get("source_rows", 0)) < 1500:
        reasons.append("source_rows_below_1500")
    if int(metrics.get("test_rows", 0)) < 300:
        reasons.append("test_rows_below_300")
    if int(metrics.get("station_count", 0)) < 3:
        reasons.append("station_count_below_3")
    if int(metrics.get("observed_months", 0)) < 6:
        reasons.append("observed_months_below_6")
    if metrics.get("split_strategy") != ROLLING_SPLIT_STRATEGY:
        reasons.append("rolling_origin_holdout_required")
    if int(metrics.get("rolling_fold_count", 0)) < 3:
        reasons.append("rolling_fold_count_below_3")
    if not bool(metrics.get("untouched_holdout")):
        reasons.append("untouched_holdout_required")
    if metrics.get("feature_version") != "forecast-features-v2":
        reasons.append("forecast_features_v2_required")
    manifest_sha = str(metrics.get("dataset_manifest_sha256") or "")
    if len(manifest_sha) != 64:
        reasons.append("dataset_manifest_sha256_required")
    if float(metrics.get("completeness", 0)) < 0.8:
        reasons.append("completeness_below_80_percent")
    baseline_mae = float(metrics.get("baseline_mae", 0))
    model_mae = float(metrics.get("model_mae", float("inf")))
    if baseline_mae <= 0 or model_mae > baseline_mae * 0.95:
        reasons.append("mae_improvement_below_5_percent")
    baseline_accuracy = float(metrics.get("baseline_category_accuracy", 0))
    model_accuracy = float(metrics.get("model_category_accuracy", 0))
    if model_accuracy < baseline_accuracy - 0.02:
        reasons.append("category_accuracy_regressed")
    if not bool(metrics.get("false_safe_gate_passed")):
        reasons.append("false_safe_gate_failed")
    coverage_target = float(metrics.get("interval_coverage_target", 0.9))
    empirical_coverage = float(metrics.get("interval_empirical_coverage", 0))
    if empirical_coverage < coverage_target - 0.05:
        reasons.append("interval_coverage_below_tolerance")
    return {"active": not reasons, "reasons": reasons}


def _tree_value(node: dict, features: Mapping[str, float]) -> float:
    if "leaf" in node:
        return float(node["leaf"])
    feature = str(node["split"])
    value = features.get(feature)
    missing = value is None
    if value is not None:
        try:
            missing = not math.isfinite(float(value))
        except (TypeError, ValueError):
            missing = True
    next_id = int(
        node["missing"]
        if missing
        else (
            node["yes"] if float(value) < float(node["split_condition"]) else node["no"]
        )
    )
    children = {int(child["nodeid"]): child for child in node.get("children", [])}
    return _tree_value(children[next_id], features)


def predict_neutral_artifact(artifact: dict, features: Mapping[str, float]) -> float:
    """Evaluate the compact JSON artifact without shipping xgboost to Vercel."""
    prediction = float(artifact.get("base_score", 0))
    for tree in artifact.get("trees", []):
        prediction += _tree_value(tree, features)
    return max(0.0, prediction)
