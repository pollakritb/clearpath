"""Pure, fail-closed analysis for PM2.5 device/reference co-location runs."""

from __future__ import annotations

import math
from collections import defaultdict
from collections.abc import Mapping, Sequence
from datetime import UTC, datetime

from backend.core.aqi import pm25_category_index

REQUIRED_FIELDS = {
    "device_code",
    "timestamp_utc",
    "device_pm25",
    "reference_pm25",
    "temperature_c",
    "relative_humidity_percent",
}
FORBIDDEN_PRIVATE_FIELDS = {
    "device_serial",
    "email",
    "image",
    "lat",
    "latitude",
    "lon",
    "longitude",
    "operator",
    "operator_name",
    "precise_coordinates",
    "site_id",
    "user_id",
}
REQUIRED_REFERENCE_BANDS = {"low", "medium", "high"}


def validate_colocation_columns(columns: Sequence[str]) -> None:
    normalized = {str(column).strip().lower() for column in columns}
    if forbidden := sorted(normalized & FORBIDDEN_PRIVATE_FIELDS):
        raise ValueError(f"private_columns_forbidden:{','.join(forbidden)}")
    if missing := sorted(REQUIRED_FIELDS - normalized):
        raise ValueError(f"required_columns_missing:{','.join(missing)}")


def _timestamp(value: object) -> datetime:
    parsed = datetime.fromisoformat(str(value).strip().replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("timestamp_timezone_missing")
    return parsed.astimezone(UTC)


def _number(value: object, code: str) -> float:
    number = float(value)
    if not math.isfinite(number):
        raise ValueError(code)
    return number


def _reference_band(pm25: float) -> str:
    if pm25 <= 25:
        return "low"
    if pm25 <= 75:
        return "medium"
    return "high"


def _metrics(reference: Sequence[float], device: Sequence[float]) -> dict:
    count = len(reference)
    errors = [
        estimate - actual for actual, estimate in zip(reference, device, strict=True)
    ]
    reference_mean = sum(reference) / count
    device_mean = sum(device) / count
    covariance = sum(
        (actual - reference_mean) * (estimate - device_mean)
        for actual, estimate in zip(reference, device, strict=True)
    )
    reference_variance = sum((value - reference_mean) ** 2 for value in reference)
    device_variance = sum((value - device_mean) ** 2 for value in device)
    denominator = math.sqrt(reference_variance * device_variance)
    false_safe_count = sum(
        pm25_category_index(estimate) < pm25_category_index(actual)
        for actual, estimate in zip(reference, device, strict=True)
    )
    return {
        "rows": count,
        "bias": sum(errors) / count,
        "mae": sum(abs(error) for error in errors) / count,
        "rmse": math.sqrt(sum(error**2 for error in errors) / count),
        "correlation": covariance / denominator if denominator else None,
        "false_safe_count": false_safe_count,
        "false_safe_rate": false_safe_count / count,
    }


def evaluate_device_colocation(
    records: Sequence[Mapping[str, object]],
    *,
    minimum_duration_hours: float,
    minimum_pairs: int,
    maximum_gap_minutes: float,
    minimum_rows_per_band: int,
    maximum_absolute_bias: float,
    maximum_mae: float,
    maximum_false_safe_rate: float,
) -> dict:
    """Evaluate de-identified paired samples using pre-registered policy values."""

    if minimum_duration_hours <= 0:
        raise ValueError("minimum_duration_hours_invalid")
    if minimum_pairs < 2 or minimum_rows_per_band < 1:
        raise ValueError("minimum_rows_invalid")
    if maximum_gap_minutes <= 0 or maximum_absolute_bias < 0 or maximum_mae < 0:
        raise ValueError("error_policy_invalid")
    if not 0 <= maximum_false_safe_rate <= 1:
        raise ValueError("false_safe_policy_invalid")

    grouped: dict[str, list[dict]] = defaultdict(list)
    seen_pairs: set[tuple[str, datetime]] = set()
    for record in records:
        device_code = str(record.get("device_code") or "").strip()
        if not device_code or len(device_code) > 80:
            raise ValueError("device_code_invalid")
        timestamp = _timestamp(record.get("timestamp_utc"))
        key = (device_code, timestamp)
        if key in seen_pairs:
            raise ValueError("duplicate_device_timestamp")
        seen_pairs.add(key)
        device_pm25 = _number(record.get("device_pm25"), "device_pm25_invalid")
        reference_pm25 = _number(record.get("reference_pm25"), "reference_pm25_invalid")
        temperature = _number(record.get("temperature_c"), "temperature_invalid")
        humidity = _number(
            record.get("relative_humidity_percent"), "relative_humidity_invalid"
        )
        if min(device_pm25, reference_pm25) < 0:
            raise ValueError("pm25_negative")
        if not -50 <= temperature <= 70 or not 0 <= humidity <= 100:
            raise ValueError("environmental_value_out_of_range")
        grouped[device_code].append(
            {
                "timestamp": timestamp,
                "device_pm25": device_pm25,
                "reference_pm25": reference_pm25,
                "reference_band": _reference_band(reference_pm25),
            }
        )
    if not grouped:
        raise ValueError("colocation_rows_empty")

    devices = []
    for device_code, rows in sorted(grouped.items()):
        rows.sort(key=lambda row: row["timestamp"])
        duration_hours = (
            rows[-1]["timestamp"] - rows[0]["timestamp"]
        ).total_seconds() / 3600
        gaps = [
            (current["timestamp"] - previous["timestamp"]).total_seconds() / 60
            for previous, current in zip(rows, rows[1:], strict=False)
        ]
        maximum_observed_gap = max(gaps, default=0.0)
        overall = _metrics(
            [row["reference_pm25"] for row in rows],
            [row["device_pm25"] for row in rows],
        )
        bands = {}
        for band in sorted(REQUIRED_REFERENCE_BANDS):
            members = [row for row in rows if row["reference_band"] == band]
            bands[band] = (
                _metrics(
                    [row["reference_pm25"] for row in members],
                    [row["device_pm25"] for row in members],
                )
                if members
                else {"rows": 0}
            )
        failures = []
        if len(rows) < minimum_pairs:
            failures.append("insufficient_pairs")
        if duration_hours < minimum_duration_hours:
            failures.append("insufficient_duration")
        if maximum_observed_gap > maximum_gap_minutes:
            failures.append("sample_gap_exceeded")
        if any(
            bands[band]["rows"] < minimum_rows_per_band
            for band in REQUIRED_REFERENCE_BANDS
        ):
            failures.append("reference_band_insufficient")
        if overall["correlation"] is None:
            failures.append("correlation_unavailable")
        if abs(overall["bias"]) > maximum_absolute_bias:
            failures.append("absolute_bias_exceeded")
        if overall["mae"] > maximum_mae:
            failures.append("mae_exceeded")
        if overall["false_safe_rate"] > maximum_false_safe_rate:
            failures.append("false_safe_rate_exceeded")
        devices.append(
            {
                "device_code": device_code,
                "ready": not failures,
                "failures": failures,
                "duration_hours": duration_hours,
                "maximum_observed_gap_minutes": maximum_observed_gap,
                "overall": overall,
                "reference_bands": bands,
            }
        )

    return {
        "ready": all(device["ready"] for device in devices),
        "row_count": sum(len(rows) for rows in grouped.values()),
        "device_count": len(devices),
        "policy": {
            "minimum_duration_hours": minimum_duration_hours,
            "minimum_pairs": minimum_pairs,
            "maximum_gap_minutes": maximum_gap_minutes,
            "minimum_rows_per_band": minimum_rows_per_band,
            "maximum_absolute_bias": maximum_absolute_bias,
            "maximum_mae": maximum_mae,
            "maximum_false_safe_rate": maximum_false_safe_rate,
        },
        "devices": devices,
    }
