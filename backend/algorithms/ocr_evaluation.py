"""Pure quality metrics and release gates for the PM2.5 OCR adapter."""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from statistics import fmean


@dataclass(frozen=True)
class OcrEvaluationGate:
    minimum_cases: int = 60
    minimum_readable_cases: int = 40
    minimum_negative_cases: int = 10
    minimum_device_families: int = 3
    maximum_mae: float = 2.0
    minimum_high_confidence_precision: float = 0.99
    maximum_negative_false_positive_rate: float = 0.0
    confidence_threshold: float = 0.92


REQUIRED_CONDITIONS = frozenset(
    {"normal", "glare", "blur", "low_light", "rotated", "not_a_meter"}
)


def _is_eligible(row: dict, threshold: float) -> bool:
    return bool(
        row.get("predicted_pm25") is not None
        and row.get("predicted_device_detected")
        and row.get("predicted_display_clear")
        and float(row.get("predicted_confidence") or 0) >= threshold
    )


def _within_tolerance(actual: float, predicted: float) -> bool:
    tolerance = max(3.0, min(15.0, max(abs(actual), abs(predicted)) * 0.10))
    return abs(actual - predicted) <= tolerance


def evaluate_ocr_cases(rows: list[dict], gate: OcrEvaluationGate | None = None) -> dict:
    """Evaluate labelled predictions without network or database access."""
    policy = gate or OcrEvaluationGate()
    readable = [row for row in rows if row.get("expected_pm25") is not None]
    negatives = [row for row in rows if row.get("expected_pm25") is None]
    errors = [
        abs(float(row["predicted_pm25"]) - float(row["expected_pm25"]))
        for row in readable
        if row.get("predicted_pm25") is not None
    ]
    eligible_readable = [
        row for row in readable if _is_eligible(row, policy.confidence_threshold)
    ]
    correct_eligible = sum(
        _within_tolerance(float(row["expected_pm25"]), float(row["predicted_pm25"]))
        for row in eligible_readable
    )
    negative_false_positives = sum(
        _is_eligible(row, policy.confidence_threshold) for row in negatives
    )
    families = {str(row.get("device_family") or "").strip() for row in readable}
    families.discard("")
    conditions = Counter(
        str(condition) for row in rows for condition in (row.get("conditions") or [])
    )
    mae = fmean(errors) if errors else None
    precision = correct_eligible / len(eligible_readable) if eligible_readable else None
    negative_false_positive_rate = (
        negative_false_positives / len(negatives) if negatives else None
    )

    failures: list[str] = []
    if len(rows) < policy.minimum_cases:
        failures.append("insufficient_total_cases")
    if len(readable) < policy.minimum_readable_cases:
        failures.append("insufficient_readable_cases")
    if len(negatives) < policy.minimum_negative_cases:
        failures.append("insufficient_negative_cases")
    if len(families) < policy.minimum_device_families:
        failures.append("insufficient_device_diversity")
    if not REQUIRED_CONDITIONS.issubset(conditions):
        failures.append("missing_required_conditions")
    if mae is None or mae > policy.maximum_mae:
        failures.append("mae_above_limit")
    if precision is None or precision < policy.minimum_high_confidence_precision:
        failures.append("high_confidence_precision_below_limit")
    if (
        negative_false_positive_rate is None
        or negative_false_positive_rate > policy.maximum_negative_false_positive_rate
    ):
        failures.append("negative_false_positive_rate_above_limit")

    return {
        "passed": not failures,
        "failure_codes": failures,
        "counts": {
            "total": len(rows),
            "readable": len(readable),
            "negative": len(negatives),
            "predicted_readable": len(errors),
            "high_confidence_eligible": len(eligible_readable),
            "device_families": len(families),
        },
        "metrics": {
            "mae": round(mae, 4) if mae is not None else None,
            "high_confidence_precision": (
                round(precision, 4) if precision is not None else None
            ),
            "negative_false_positive_rate": (
                round(negative_false_positive_rate, 4)
                if negative_false_positive_rate is not None
                else None
            ),
        },
        "coverage": {
            "device_families": sorted(families),
            "conditions": dict(sorted(conditions.items())),
            "missing_conditions": sorted(REQUIRED_CONDITIONS.difference(conditions)),
        },
        "policy": {
            "minimum_cases": policy.minimum_cases,
            "minimum_readable_cases": policy.minimum_readable_cases,
            "minimum_negative_cases": policy.minimum_negative_cases,
            "minimum_device_families": policy.minimum_device_families,
            "maximum_mae": policy.maximum_mae,
            "minimum_high_confidence_precision": policy.minimum_high_confidence_precision,
            "maximum_negative_false_positive_rate": policy.maximum_negative_false_positive_rate,
            "confidence_threshold": policy.confidence_threshold,
        },
    }
