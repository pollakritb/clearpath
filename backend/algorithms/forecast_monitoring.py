"""Pure prediction settlement, drift, shadow and canary release rules."""

from __future__ import annotations

import hashlib
import math
from bisect import bisect_right
from collections.abc import Mapping, Sequence
from statistics import mean, median

from ..core.aqi import pm25_category_index


def settle_prediction(prediction: Mapping[str, object], observed_pm25: float) -> dict:
    predicted = float(prediction["pm25"])
    observed = float(observed_pm25)
    if not all(
        math.isfinite(value) and 0 <= value <= 2000 for value in (predicted, observed)
    ):
        raise ValueError("settlement_value_invalid")
    error = predicted - observed
    lower = float(prediction["lower"])
    upper = float(prediction["upper"])
    predicted_category = pm25_category_index(predicted)
    observed_category = pm25_category_index(observed)
    return {
        "observed_pm25": observed,
        "absolute_error": abs(error),
        "squared_error": error**2,
        "signed_error": error,
        "category_correct": predicted_category == observed_category,
        "false_safe": predicted_category < observed_category,
        "interval_covered": lower <= observed <= upper,
        "interval_width": max(0.0, upper - lower),
    }


def aggregate_settled(rows: Sequence[Mapping[str, object]]) -> dict:
    if not rows:
        raise ValueError("settled_rows_missing")
    absolute = [float(row["absolute_error"]) for row in rows]
    squared = [float(row["squared_error"]) for row in rows]
    signed = [float(row.get("signed_error", 0)) for row in rows]
    return {
        "rows": len(rows),
        "mae": mean(absolute),
        "rmse": math.sqrt(mean(squared)),
        "median_absolute_error": median(absolute),
        "bias": mean(signed),
        "category_accuracy": mean(bool(row["category_correct"]) for row in rows),
        "false_safe_rate": mean(bool(row["false_safe"]) for row in rows),
        "interval_coverage": mean(bool(row["interval_covered"]) for row in rows),
        "mean_interval_width": mean(float(row["interval_width"]) for row in rows),
    }


def missingness_drift(
    reference: Mapping[str, float],
    current: Mapping[str, float],
    *,
    alert_delta: float = 0.15,
) -> dict:
    features = sorted(set(reference) | set(current))
    deltas = {
        feature: float(current.get(feature, 0)) - float(reference.get(feature, 0))
        for feature in features
    }
    alerts = [feature for feature, delta in deltas.items() if abs(delta) >= alert_delta]
    return {"deltas": deltas, "alert_features": alerts, "drifted": bool(alerts)}


def population_stability_index(
    reference: Sequence[float],
    current: Sequence[float],
    *,
    bins: int = 10,
    alert_threshold: float = 0.2,
) -> dict:
    """Compare numeric distributions using reference-quantile PSI bins."""

    reference_values = sorted(
        float(value) for value in reference if math.isfinite(float(value))
    )
    current_values = [float(value) for value in current if math.isfinite(float(value))]
    if len(reference_values) < bins or len(current_values) < bins:
        raise ValueError("drift_sample_insufficient")
    boundaries = []
    for index in range(1, bins):
        position = round(index * (len(reference_values) - 1) / bins)
        boundary = reference_values[position]
        if not boundaries or boundary > boundaries[-1]:
            boundaries.append(boundary)
    bucket_count = len(boundaries) + 1
    reference_counts = [0] * bucket_count
    current_counts = [0] * bucket_count
    for value in reference_values:
        reference_counts[bisect_right(boundaries, value)] += 1
    for value in current_values:
        current_counts[bisect_right(boundaries, value)] += 1
    epsilon = 1e-6
    score = 0.0
    for reference_count, current_count in zip(
        reference_counts, current_counts, strict=True
    ):
        reference_ratio = max(epsilon, reference_count / len(reference_values))
        current_ratio = max(epsilon, current_count / len(current_values))
        score += (current_ratio - reference_ratio) * math.log(
            current_ratio / reference_ratio
        )
    return {
        "psi": round(score, 6),
        "drifted": score >= alert_threshold,
        "alert_threshold": alert_threshold,
        "boundaries": boundaries,
        "reference_count": len(reference_values),
        "current_count": len(current_values),
    }


def canary_eligible(
    station_id: str,
    *,
    percentage: int,
    allowlist: Sequence[str] = (),
) -> bool:
    if station_id in set(allowlist):
        return True
    if percentage <= 0:
        return False
    if percentage >= 100:
        return True
    bucket = int(hashlib.sha256(station_id.encode()).hexdigest()[:8], 16) % 100
    return bucket < percentage


def evaluate_shadow_gate(
    model: Mapping[str, float],
    baseline: Mapping[str, float],
    operations: Mapping[str, float],
    *,
    observed_days: int,
    minimum_days: int = 14,
) -> dict:
    reasons = []
    if observed_days < minimum_days:
        reasons.append("shadow_duration_insufficient")
    if float(model.get("mae", math.inf)) > float(baseline.get("mae", -math.inf)) * 0.95:
        reasons.append("shadow_mae_improvement_insufficient")
    if (
        float(model.get("false_safe_rate", 1))
        > float(baseline.get("false_safe_rate", 0)) + 0.02
    ):
        reasons.append("shadow_false_safe_regression")
    if float(model.get("interval_coverage", 0)) < 0.85:
        reasons.append("shadow_interval_undercoverage")
    if float(operations.get("fallback_rate", 1)) > 0.1:
        reasons.append("shadow_fallback_rate_high")
    if float(operations.get("error_rate", 1)) > 0.01:
        reasons.append("shadow_error_rate_high")
    return {"passed": not reasons, "reasons": reasons}


def evaluation_alert_codes(
    candidate: Mapping[str, float],
    baseline: Mapping[str, float] | None = None,
    *,
    minimum_rows: int = 30,
) -> dict:
    """Return stable alert codes from settled metrics; never promote a model."""

    rows = int(candidate.get("rows", 0))
    if rows < minimum_rows:
        return {
            "status": "insufficient_evidence",
            "rows": rows,
            "alert_codes": [],
        }

    def number(name: str, default: float) -> float:
        value = candidate.get(name)
        return default if value is None else float(value)

    alerts = []
    required_metrics = ("mae", "bias", "false_safe_rate", "interval_coverage")
    if any(candidate.get(name) is None for name in required_metrics):
        alerts.append("forecast_evaluation_metric_missing")
    if candidate.get("bias") is not None and abs(number("bias", 0)) > 10:
        alerts.append("forecast_bias_high")
    if (
        candidate.get("false_safe_rate") is not None
        and number("false_safe_rate", 0) > 0.05
    ):
        alerts.append("forecast_false_safe_rate_high")
    if (
        candidate.get("interval_coverage") is not None
        and number("interval_coverage", 0) < 0.85
    ):
        alerts.append("forecast_interval_undercoverage")
    if number("fallback_rate", 0) > 0.1:
        alerts.append("forecast_fallback_rate_high")
    if number("p95_latency_ms", 0) > 2000:
        alerts.append("forecast_p95_latency_high")
    if baseline:
        candidate_mae = candidate.get("mae")
        baseline_mae = baseline.get("mae")
        if (
            candidate_mae is not None
            and baseline_mae is not None
            and float(candidate_mae) > float(baseline_mae)
        ):
            alerts.append("forecast_accuracy_worse_than_baseline")
    return {"status": "evaluated", "rows": rows, "alert_codes": sorted(alerts)}


def reconciliation_alert_codes(
    *,
    stations: int,
    expected_hours: int,
    missing_hours: int,
    invalid_rows: int,
    missing_rate_threshold: float = 0.2,
) -> list[str]:
    """Convert ingestion reconciliation totals into stable operational signals."""

    alerts = []
    if stations <= 0:
        alerts.append("forecast_ingestion_no_stations")
    if invalid_rows > 0:
        alerts.append("forecast_ingestion_invalid_rows")
    if expected_hours > 0 and missing_hours / expected_hours > missing_rate_threshold:
        alerts.append("forecast_ingestion_missingness_high")
    return sorted(alerts)
