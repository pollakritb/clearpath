"""Inverse Distance Weighting (IDW) — ประมาณค่า PM2.5 ณ จุดที่ไม่มีสถานี

    estimate(x) = Σ wᵢ·vᵢ / Σ wᵢ ,   wᵢ = 1 / dᵢ^p

- d = ระยะ haversine (km) ไปยังสถานี
- p = power (ยิ่งมาก สถานีใกล้ยิ่งมีอิทธิพล) default 2
- ใช้แค่ k สถานีใกล้สุด (default 5) เพื่อความเร็ว + ลด noise จากสถานีไกล
"""
from __future__ import annotations

from typing import Optional, Sequence

import numpy as np

from .distance import haversine_km

Station = dict  # {"lat": float, "lon": float, "pm25": float | None}


def idw_value(
    lat: float,
    lon: float,
    stations: Sequence[Station],
    power: float = 2.0,
    k: int = 5,
) -> Optional[float]:
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


def score_route(
    waypoints: Sequence[Sequence[float]],
    stations: Sequence[Station],
    power: float = 2.0,
    k: int = 5,
) -> dict:
    """คำนวณค่า PM2.5 ตลอดเส้นทาง

    waypoints: [[lat, lon], ...] (ควร resample มาแล้วทุก ~500m)
    คืน {avg_pm25, max_pm25, samples:[{lat,lon,pm25}, ...], covered}
    covered=False เมื่อประเมินไม่ได้เลย (ไม่มีสถานีที่ใช้ได้) — ห้ามนับว่า "สะอาดสุด"
    """
    samples: list[dict] = []
    for wp in waypoints:
        v = idw_value(wp[0], wp[1], stations, power, k)
        if v is not None:
            samples.append({"lat": float(wp[0]), "lon": float(wp[1]), "pm25": round(v, 2)})

    if not samples:
        return {"avg_pm25": 0.0, "max_pm25": 0.0, "samples": [], "covered": False}

    vals = np.array([s["pm25"] for s in samples], dtype=float)
    return {
        "avg_pm25": round(float(vals.mean()), 2),
        "max_pm25": round(float(vals.max()), 2),
        "samples": samples,
        "covered": True,
    }


def route_confidence(
    waypoints: Sequence[Sequence[float]],
    stations: Sequence[Station],
    good_km: float = 5.0,
    bad_km: float = 25.0,
) -> dict:
    """ความเชื่อมั่นของการประมาณค่าตลอดเส้นทาง — จัดการ "พื้นที่เซนเซอร์เบาบาง"

    แนวคิด: ยิ่งจุดบนเส้นทางอยู่ใกล้สถานีจริง ค่าประมาณ IDW ยิ่งน่าเชื่อถือ
    - แต่ละจุด: หาระยะถึงสถานีที่ "ใกล้ที่สุด" (haversine)
    - คะแนนจุด = 1.0 ถ้า ≤ good_km, ไล่ลงเป็น 0.0 ที่ ≥ bad_km (เชิงเส้น)
    - confidence เส้นทาง = ค่าเฉลี่ยคะแนนทุกจุด (0..1)

    คืน {confidence, avg_nearest_km, max_nearest_km, label}
    """
    usable = [s for s in stations if s.get("pm25") is not None]
    if not usable or not waypoints:
        return {"confidence": 0.0, "avg_nearest_km": None, "max_nearest_km": None, "label": "ต่ำ"}

    nearest = [
        min(haversine_km(wp[0], wp[1], s["lat"], s["lon"]) for s in usable)
        for wp in waypoints
    ]
    span = bad_km - good_km
    scores = [
        1.0 if d <= good_km else 0.0 if d >= bad_km else 1.0 - (d - good_km) / span
        for d in nearest
    ]
    conf = sum(scores) / len(scores)
    label = "สูง" if conf >= 0.75 else "ปานกลาง" if conf >= 0.4 else "ต่ำ"
    return {
        "confidence": round(conf, 3),
        "avg_nearest_km": round(sum(nearest) / len(nearest), 2),
        "max_nearest_km": round(max(nearest), 2),
        "label": label,
    }
