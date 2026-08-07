from datetime import UTC, datetime, timedelta

import pytest

from backend.algorithms.device_colocation import (
    evaluate_device_colocation,
    validate_colocation_columns,
)

POLICY = {
    "minimum_duration_hours": 24,
    "minimum_pairs": 25,
    "maximum_gap_minutes": 61,
    "minimum_rows_per_band": 3,
    "maximum_absolute_bias": 5,
    "maximum_mae": 5,
    "maximum_false_safe_rate": 0.1,
}


def _rows(*, high_device_value: float = 82) -> list[dict]:
    start = datetime(2026, 1, 1, tzinfo=UTC)
    reference = [10, 20, 24, 30, 40, 70, 80, 90, 100] * 3
    return [
        {
            "device_code": "DEVICE-A",
            "timestamp_utc": (start + timedelta(hours=index)).isoformat(),
            "device_pm25": high_device_value if actual == 80 else actual + 1,
            "reference_pm25": actual,
            "temperature_c": 30,
            "relative_humidity_percent": 60,
        }
        for index, actual in enumerate(reference)
    ]


def test_colocation_passes_complete_low_medium_high_run():
    result = evaluate_device_colocation(_rows(), **POLICY)

    assert result["ready"] is True
    assert result["device_count"] == 1
    assert result["devices"][0]["duration_hours"] == 26
    assert set(result["devices"][0]["reference_bands"]) == {"low", "medium", "high"}


def test_colocation_fails_false_safe_and_insufficient_duration():
    rows = _rows()[:20]
    for row in rows:
        row["device_pm25"] = 0
    result = evaluate_device_colocation(rows, **POLICY)

    assert result["ready"] is False
    assert "insufficient_duration" in result["devices"][0]["failures"]
    assert "false_safe_rate_exceeded" in result["devices"][0]["failures"]


def test_colocation_rejects_duplicate_timestamp():
    rows = _rows()
    rows.append(dict(rows[0]))
    with pytest.raises(ValueError, match="duplicate_device_timestamp"):
        evaluate_device_colocation(rows, **POLICY)


def test_colocation_rejects_private_columns():
    with pytest.raises(ValueError, match="private_columns_forbidden"):
        validate_colocation_columns([*sorted(POLICY), "device_serial"])
