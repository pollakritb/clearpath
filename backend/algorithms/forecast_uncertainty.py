"""Pure residual calibration and interval evaluation for PM2.5 forecasts."""

from __future__ import annotations

import math
from collections import defaultdict
from collections.abc import Mapping, Sequence

from .forecast_quality import canonical_sha256


def _quantile(values: Sequence[float], probability: float) -> float:
    if not values:
        raise ValueError("calibration_values_missing")
    ordered = sorted(float(value) for value in values)
    position = (len(ordered) - 1) * probability
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return ordered[lower]
    weight = position - lower
    return ordered[lower] * (1 - weight) + ordered[upper] * weight


def calibrate_residual_intervals(
    rows: Sequence[Mapping[str, object]],
    *,
    coverage_target: float = 0.9,
    minimum_slice_rows: int = 30,
    version: str,
) -> dict:
    if not 0.5 < coverage_target < 1:
        raise ValueError("coverage_target_out_of_range")
    residuals: dict[str, list[float]] = defaultdict(list)
    for row in rows:
        residual = float(row["actual"]) - float(row["predicted"])
        horizon = int(row["horizon_hours"])
        station = str(row.get("station_id") or "unknown")
        season = str(row.get("season") or "unknown")
        residuals[f"horizon:{horizon}"].append(residual)
        residuals[f"horizon:{horizon}:station:{station}"].append(residual)
        residuals[f"horizon:{horizon}:season:{season}"].append(residual)
    tail = (1 - coverage_target) / 2
    slices = {}
    for key, values in sorted(residuals.items()):
        if key.count(":") > 1 and len(values) < minimum_slice_rows:
            continue
        slices[key] = {
            "rows": len(values),
            "lower_residual": _quantile(values, tail),
            "upper_residual": _quantile(values, 1 - tail),
        }
    calibration = {
        "version": version,
        "coverage_target": coverage_target,
        "minimum_slice_rows": minimum_slice_rows,
        "slices": slices,
    }
    calibration["calibration_sha256"] = canonical_sha256(calibration)
    return calibration


def apply_calibrated_interval(
    prediction: float,
    calibration: Mapping[str, object],
    *,
    horizon_hours: int,
    station_id: str | None = None,
    season: str | None = None,
    data_quality: str = "sufficient",
) -> dict:
    slices = calibration.get("slices") or {}
    if not isinstance(slices, Mapping):
        raise ValueError("calibration_slices_invalid")
    candidates = []
    if station_id:
        candidates.append(f"horizon:{horizon_hours}:station:{station_id}")
    if season:
        candidates.append(f"horizon:{horizon_hours}:season:{season}")
    candidates.append(f"horizon:{horizon_hours}")
    selected_key = next((key for key in candidates if key in slices), None)
    if selected_key is None:
        raise ValueError("calibration_slice_missing")
    selected = slices[selected_key]
    if not isinstance(selected, Mapping):
        raise ValueError("calibration_slice_invalid")
    lower = max(0.0, prediction + float(selected["lower_residual"]))
    upper = max(lower, prediction + float(selected["upper_residual"]))
    minimum_width = 10.0 if data_quality == "limited" else 4.0
    if upper - lower < minimum_width:
        center = max(0.0, prediction)
        half = minimum_width / 2
        lower = max(0.0, center - half)
        upper = max(lower + minimum_width, center + half)
    return {
        "lower": lower,
        "upper": upper,
        "coverage_target": float(calibration["coverage_target"]),
        "calibration_version": str(calibration["version"]),
        "calibration_slice": selected_key,
    }


def interval_metrics(
    actual: Sequence[float],
    lower: Sequence[float],
    upper: Sequence[float],
) -> dict:
    if not actual or not (len(actual) == len(lower) == len(upper)):
        raise ValueError("interval_lengths_invalid")
    covered = [
        float(low) <= float(value) <= float(high)
        for value, low, high in zip(actual, lower, upper, strict=True)
    ]
    widths = [
        max(0.0, float(high) - float(low))
        for low, high in zip(lower, upper, strict=True)
    ]
    return {
        "rows": len(actual),
        "empirical_coverage": sum(covered) / len(covered),
        "mean_interval_width": sum(widths) / len(widths),
    }
