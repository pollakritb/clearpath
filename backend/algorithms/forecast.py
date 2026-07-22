"""PM2.5 short-term forecast — pure, deterministic, no I/O.

โมเดล MVP ใช้ damped local trend จากค่ารายชั่วโมงล่าสุด พร้อมช่วงความไม่แน่นอน
ที่ขยายตามระยะพยากรณ์ เหมาะเป็น baseline ที่อธิบายได้และ deploy บน Vercel ได้เบา
ก่อนอัปเกรดเป็นโมเดล time-series ที่ผ่านการ backtest ตามฤดูกาล.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from datetime import UTC, datetime, timedelta
from statistics import median


def _parse_time(value: str) -> datetime:
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


def forecast_pm25(readings: Sequence[dict], horizon_hours: int = 12) -> dict:
    """พยากรณ์ 1..horizon_hours จาก readings [{recorded_at, pm25}].

    ใช้ median slope ของคู่จุดต่อเนื่อง 12 ช่วงล่าสุดเพื่อลดผล outlier แล้ว damp
    แนวโน้มลง 12% ต่อชั่วโมง ช่วงคาดการณ์อิง residual MAD และกว้างขึ้นด้วย sqrt(h).
    """
    usable: list[tuple[datetime, float]] = []
    for row in readings:
        if row.get("pm25") is None or not row.get("recorded_at"):
            continue
        try:
            usable.append((_parse_time(str(row["recorded_at"])), float(row["pm25"])))
        except (TypeError, ValueError):
            continue
    usable.sort(key=lambda item: item[0])
    if not usable:
        raise ValueError("ไม่มีข้อมูลย้อนหลังสำหรับพยากรณ์")

    recent = usable[-24:]
    slopes: list[float] = []
    pairs = list(zip(recent[:-1], recent[1:], strict=True))[-12:]
    for (t0, v0), (t1, v1) in pairs:
        hours = (t1 - t0).total_seconds() / 3600.0
        if hours > 0:
            slopes.append((v1 - v0) / hours)
    trend = median(slopes) if slopes else 0.0
    trend = max(-8.0, min(8.0, trend))

    values = [v for _, v in recent]
    center = median(values)
    mad = median([abs(v - center) for v in values]) if len(values) > 2 else 2.0
    sigma = max(2.0, 1.4826 * mad)

    last_time, last_value = recent[-1]
    points: list[dict] = []
    accumulated = 0.0
    for hour in range(1, horizon_hours + 1):
        accumulated += trend * (0.88 ** (hour - 1))
        prediction = max(0.0, last_value + accumulated)
        margin = 1.64 * sigma * math.sqrt(1.0 + hour / 6.0)
        points.append(
            {
                "forecast_at": (last_time + timedelta(hours=hour)).isoformat(),
                "pm25": round(prediction, 1),
                "lower": round(max(0.0, prediction - margin), 1),
                "upper": round(prediction + margin, 1),
            }
        )
    return {
        "generated_at": datetime.now(UTC).isoformat(),
        "method": "damped-local-trend-v1",
        "source_points": len(recent),
        "points": points,
    }
