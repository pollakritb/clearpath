"""Pure production evaluator and activation gate for offline-trained models."""

from __future__ import annotations

from collections.abc import Mapping


def evaluate_activation_gate(metrics: Mapping[str, float | int]) -> dict:
    reasons: list[str] = []
    if float(metrics.get("history_days", 0)) < 90:
        reasons.append("history_days_below_90")
    if int(metrics.get("source_rows", 0)) < 1500:
        reasons.append("source_rows_below_1500")
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
    return {"active": not reasons, "reasons": reasons}


def _tree_value(node: dict, features: Mapping[str, float]) -> float:
    if "leaf" in node:
        return float(node["leaf"])
    feature = str(node["split"])
    value = features.get(feature)
    next_id = int(
        node["missing"]
        if value is None
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
