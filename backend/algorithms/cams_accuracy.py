"""Pure descriptive metrics for observed CAMS validation pairs."""

from __future__ import annotations

HIGH_PM25 = 37.5


def aggregate(rows: list[dict], *, threshold: float = HIGH_PM25) -> dict:
    """MAE, signed bias and high-dust detection on observed 1h means."""

    if not rows:
        return {
            "count": 0,
            "distinct_station_hours": 0,
            "mae": None,
            "bias": None,
            "high_event_count": 0,
            "high_event_recall": None,
            "high_event_precision": None,
        }
    errors = [float(row["prediction"]) - float(row["observed_pm25"]) for row in rows]
    true_high = sum(float(row["observed_pm25"]) > threshold for row in rows)
    predicted_high = sum(float(row["prediction"]) > threshold for row in rows)
    hits = sum(
        float(row["prediction"]) > threshold and float(row["observed_pm25"]) > threshold
        for row in rows
    )
    return {
        "count": len(rows),
        "distinct_station_hours": len(
            {(row["station_id"], row["valid_at"]) for row in rows}
        ),
        "mae": sum(abs(error) for error in errors) / len(errors),
        "bias": sum(errors) / len(errors),
        "high_event_count": true_high,
        "high_event_recall": hits / true_high if true_high else None,
        "high_event_precision": hits / predicted_high if predicted_high else None,
    }
