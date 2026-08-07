"""Deterministic forecast baselines and reproducible evaluation helpers."""

from __future__ import annotations

import math
from collections import defaultdict
from collections.abc import Mapping, Sequence
from datetime import UTC, datetime, timedelta, timezone
from statistics import median

from ..core.aqi import pm25_category_index
from .forecast_quality import evaluate_feature_value, parse_timestamp

# Thailand has used UTC+07:00 without daylight-saving transitions since 1920.
# A fixed offset keeps the production function independent of OS tzdata files.
BANGKOK = timezone(timedelta(hours=7), "Asia/Bangkok")
BASELINE_METHODS = (
    "persistence",
    "seasonal_naive",
    "damped_local_trend",
    "diurnal_climatology",
)


def _series(readings: Sequence[Mapping[str, object]]) -> list[tuple[datetime, float]]:
    values: dict[datetime, float] = {}
    for row in readings:
        try:
            timestamp = parse_timestamp(row.get("recorded_at"))
        except (TypeError, ValueError):
            continue
        result = evaluate_feature_value("pm25", row.get("pm25"))
        if result["usable"]:
            values[timestamp] = float(result["value"])
    return sorted(values.items())


def _robust_sigma(values: Sequence[float]) -> float:
    if len(values) < 3:
        return 2.0
    center = median(values)
    return max(2.0, 1.4826 * median(abs(value - center) for value in values))


def _interval(center: float, sigma: float, horizon: int) -> tuple[float, float]:
    margin = 1.64 * sigma * math.sqrt(1.0 + horizon / 6.0)
    return max(0.0, center - margin), center + margin


def persistence_forecast(
    readings: Sequence[Mapping[str, object]], horizon_hours: int
) -> list[dict]:
    series = _series(readings)
    if not series:
        raise ValueError("no_usable_readings")
    last_time, last_value = series[-1]
    sigma = _robust_sigma([value for _, value in series[-24:]])
    points = []
    for horizon in range(1, horizon_hours + 1):
        lower, upper = _interval(last_value, sigma, horizon)
        points.append(
            {
                "forecast_at": (last_time + timedelta(hours=horizon)).isoformat(),
                "pm25": last_value,
                "lower": lower,
                "upper": upper,
                "horizon_hours": horizon,
            }
        )
    return points


def seasonal_naive_forecast(
    readings: Sequence[Mapping[str, object]], horizon_hours: int
) -> list[dict]:
    series = _series(readings)
    if not series:
        raise ValueError("no_usable_readings")
    lookup = dict(series)
    last_time, last_value = series[-1]
    sigma = _robust_sigma([value for _, value in series[-24:]])
    points = []
    for horizon in range(1, horizon_hours + 1):
        target = last_time + timedelta(hours=horizon)
        candidates = [
            lookup[comparison]
            for comparison in (
                target - timedelta(hours=24),
                target - timedelta(hours=168),
            )
            if comparison in lookup
        ]
        prediction = median(candidates) if candidates else last_value
        lower, upper = _interval(prediction, sigma, horizon)
        points.append(
            {
                "forecast_at": target.isoformat(),
                "pm25": prediction,
                "lower": lower,
                "upper": upper,
                "horizon_hours": horizon,
            }
        )
    return points


def damped_local_trend_forecast(
    readings: Sequence[Mapping[str, object]], horizon_hours: int
) -> list[dict]:
    series = _series(readings)
    if not series:
        raise ValueError("no_usable_readings")
    recent = series[-24:]
    slopes = []
    for (first_time, first), (second_time, second) in zip(
        recent,
        recent[1:],
        strict=False,
    ):
        hours = (second_time - first_time).total_seconds() / 3600
        if 0 < hours <= 2:
            slopes.append((second - first) / hours)
    trend = max(-8.0, min(8.0, median(slopes) if slopes else 0.0))
    sigma = _robust_sigma([value for _, value in recent])
    last_time, last_value = recent[-1]
    accumulated = 0.0
    points = []
    for horizon in range(1, horizon_hours + 1):
        accumulated += trend * 0.88 ** (horizon - 1)
        prediction = max(0.0, last_value + accumulated)
        lower, upper = _interval(prediction, sigma, horizon)
        points.append(
            {
                "forecast_at": (last_time + timedelta(hours=horizon)).isoformat(),
                "pm25": prediction,
                "lower": lower,
                "upper": upper,
                "horizon_hours": horizon,
            }
        )
    return points


def diurnal_climatology_forecast(
    readings: Sequence[Mapping[str, object]], horizon_hours: int
) -> list[dict]:
    series = _series(readings)
    if not series:
        raise ValueError("no_usable_readings")
    buckets: dict[tuple[int, int], list[float]] = defaultdict(list)
    hour_buckets: dict[int, list[float]] = defaultdict(list)
    for timestamp, value in series:
        local = timestamp.astimezone(BANGKOK)
        buckets[(local.month, local.hour)].append(value)
        hour_buckets[local.hour].append(value)
    last_time, last_value = series[-1]
    sigma = _robust_sigma([value for _, value in series[-24:]])
    points = []
    for horizon in range(1, horizon_hours + 1):
        target = last_time + timedelta(hours=horizon)
        local = target.astimezone(BANGKOK)
        candidates = buckets.get((local.month, local.hour)) or hour_buckets.get(
            local.hour
        )
        prediction = median(candidates) if candidates else last_value
        lower, upper = _interval(prediction, sigma, horizon)
        points.append(
            {
                "forecast_at": target.isoformat(),
                "pm25": prediction,
                "lower": lower,
                "upper": upper,
                "horizon_hours": horizon,
            }
        )
    return points


def forecast_with_baseline(
    method: str,
    readings: Sequence[Mapping[str, object]],
    horizon_hours: int,
) -> dict:
    implementations = {
        "persistence": persistence_forecast,
        "seasonal_naive": seasonal_naive_forecast,
        "damped_local_trend": damped_local_trend_forecast,
        "diurnal_climatology": diurnal_climatology_forecast,
    }
    if method not in implementations:
        raise ValueError("unknown_baseline_method")
    points = implementations[method](readings, horizon_hours)
    return {
        "generated_at": datetime.now(UTC).isoformat(),
        "method": method,
        "source_points": len(_series(readings)[-24:]),
        "points": points,
    }


def evaluate_predictions(actual: Sequence[float], predicted: Sequence[float]) -> dict:
    if not actual or len(actual) != len(predicted):
        raise ValueError("prediction_lengths_invalid")
    errors = [
        forecast - observed
        for observed, forecast in zip(actual, predicted, strict=True)
    ]
    absolute = [abs(error) for error in errors]
    squared = [error * error for error in errors]
    category_matches = [
        pm25_category_index(float(observed)) == pm25_category_index(float(forecast))
        for observed, forecast in zip(actual, predicted, strict=True)
    ]
    false_safe = [
        pm25_category_index(float(forecast)) < pm25_category_index(float(observed))
        for observed, forecast in zip(actual, predicted, strict=True)
    ]
    return {
        "rows": len(actual),
        "mae": sum(absolute) / len(absolute),
        "rmse": math.sqrt(sum(squared) / len(squared)),
        "median_absolute_error": median(absolute),
        "bias": sum(errors) / len(errors),
        "category_accuracy": sum(category_matches) / len(category_matches),
        "false_safe_rate": sum(false_safe) / len(false_safe),
    }


def champion_baseline(metrics: Mapping[str, Mapping[str, float]]) -> str:
    """Choose lowest MAE, breaking ties by false-safe rate then stable name."""

    eligible = [name for name in BASELINE_METHODS if name in metrics]
    if not eligible:
        raise ValueError("baseline_metrics_missing")
    return min(
        eligible,
        key=lambda name: (
            float(metrics[name].get("mae", float("inf"))),
            float(metrics[name].get("false_safe_rate", float("inf"))),
            name,
        ),
    )


def backtest_baselines(
    readings: Sequence[Mapping[str, object]],
    horizon_hours: int,
    *,
    minimum_history: int = 24,
) -> dict:
    """Walk forward with no future rows and compare every baseline method."""

    ordered = sorted(readings, key=lambda row: str(row.get("recorded_at") or ""))
    target_lookup = {}
    for row in ordered:
        try:
            target_lookup[parse_timestamp(row.get("recorded_at"))] = row
        except (TypeError, ValueError):
            continue
    predictions: dict[str, list[float]] = {method: [] for method in BASELINE_METHODS}
    actual: list[float] = []
    timestamps: list[str] = []
    for index in range(minimum_history - 1, len(ordered)):
        try:
            prediction_at = parse_timestamp(ordered[index].get("recorded_at"))
        except (TypeError, ValueError):
            continue
        target_at = prediction_at + timedelta(hours=horizon_hours)
        target = target_lookup.get(target_at)
        if target is None:
            continue
        target_result = evaluate_feature_value("pm25", target.get("pm25"))
        if not target_result["usable"]:
            continue
        history = ordered[: index + 1]
        method_values = {}
        for method in BASELINE_METHODS:
            result = forecast_with_baseline(method, history, horizon_hours)
            method_values[method] = float(result["points"][-1]["pm25"])
        actual.append(float(target_result["value"]))
        timestamps.append(target_at.isoformat())
        for method, value in method_values.items():
            predictions[method].append(value)
    if not actual:
        raise ValueError("baseline_backtest_rows_missing")
    metrics = {
        method: evaluate_predictions(actual, values)
        for method, values in predictions.items()
    }
    return {
        "rows": len(actual),
        "actual": actual,
        "timestamps": timestamps,
        "predictions": predictions,
        "metrics": metrics,
        "champion": champion_baseline(metrics),
    }
