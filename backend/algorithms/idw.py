"""Inverse Distance Weighting (IDW) — ประมาณค่า PM2.5 ณ จุดที่ไม่มีสถานี

    estimate(x) = Σ wᵢ·vᵢ / Σ wᵢ ,   wᵢ = 1 / dᵢ^p

- d = ระยะ haversine (km) ไปยังสถานี
- p = power (ยิ่งมาก สถานีใกล้ยิ่งมีอิทธิพล) default 2
- ใช้แค่ k สถานีใกล้สุด (default 5) เพื่อความเร็ว + ลด noise จากสถานีไกล
"""

from __future__ import annotations

from collections.abc import Sequence

import numpy as np

from .distance import haversine_km

Station = dict  # {"lat": float, "lon": float, "pm25": float | None}


def idw_value(
    lat: float,
    lon: float,
    stations: Sequence[Station],
    power: float = 2.0,
    k: int = 5,
) -> float | None:
    """ประมาณค่า PM2.5 ที่พิกัด (lat, lon). คืน None ถ้าไม่มีข้อมูลสถานีที่ใช้ได้"""
    usable = [s for s in stations if s.get("pm25") is not None]
    if not usable:
        return None

    dists = np.array(
        [haversine_km(lat, lon, s["lat"], s["lon"]) for s in usable], dtype=float
    )
    values = np.array([float(s["pm25"]) for s in usable], dtype=float)

    # ตรงกับสถานีพอดี → คืนค่าสถานีนั้นเลย (กัน division by zero)
    exact = np.where(dists < 1e-9)[0]
    if exact.size:
        return float(values[exact[0]])

    # เลือก k สถานีใกล้สุด
    if k and k < dists.size:
        nearest = np.argsort(dists)[:k]
        dists = dists[nearest]
        values = values[nearest]

    weights = 1.0 / np.power(dists, power)
    return float(np.sum(weights * values) / np.sum(weights))
