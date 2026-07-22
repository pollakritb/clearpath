"""Pure feature construction shared by offline training and inference."""

from __future__ import annotations

import math
from collections.abc import Sequence
from datetime import datetime

LAGS = (1, 3, 6, 12, 24)


def feature_vector(rows: Sequence[dict], index: int) -> dict[str, float]:
    if index < max(LAGS):
        raise ValueError("ต้องมีข้อมูลย้อนหลังอย่างน้อย 24 ชั่วโมง")
    row = rows[index]
    recorded = datetime.fromisoformat(str(row["recorded_at"]).replace("Z", "+00:00"))
    features: dict[str, float] = {}
    for lag in LAGS:
        features[f"pm25_lag_{lag}"] = float(rows[index - lag]["pm25"])
    recent = [float(item["pm25"]) for item in rows[index - 6 : index]]
    features["pm25_mean_6"] = sum(recent) / len(recent)
    features["pm25_slope_6"] = (recent[-1] - recent[0]) / max(1, len(recent) - 1)
    features["hour_sin"] = math.sin(2 * math.pi * recorded.hour / 24)
    features["hour_cos"] = math.cos(2 * math.pi * recorded.hour / 24)
    features["month_sin"] = math.sin(2 * math.pi * recorded.month / 12)
    features["month_cos"] = math.cos(2 * math.pi * recorded.month / 12)
    for name in (
        "temperature",
        "humidity",
        "wind_speed",
        "wind_deg",
        "rain_mm",
        "hotspot_count",
        "weighted_frp",
        "upwind_hotspot_count",
    ):
        features[name] = float(row.get(name) or 0)
    return features


def training_examples(
    rows: Sequence[dict], horizon_hours: int
) -> tuple[list[dict], list[float]]:
    features: list[dict] = []
    targets: list[float] = []
    for index in range(max(LAGS), len(rows) - horizon_hours):
        if (
            rows[index].get("pm25") is None
            or rows[index + horizon_hours].get("pm25") is None
        ):
            continue
        try:
            features.append(feature_vector(rows, index))
            targets.append(float(rows[index + horizon_hours]["pm25"]))
        except (KeyError, TypeError, ValueError):
            continue
    return features, targets
