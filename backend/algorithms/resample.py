"""Resample เส้นทาง (polyline) ให้มีจุดห่างกัน ~step_m เมตรเท่าๆ กัน

ORS คืน geometry เป็นจุดจำนวนมากที่ระยะห่างไม่เท่ากัน (ถี่ตรงโค้ง ห่างตรงทางตรง)
เราจึง resample เองด้วยระยะสะสม haversine + เชิงเส้นระหว่างจุด เพื่อให้การให้คะแนน
PM2.5 ตลอดเส้นทางเป็นธรรม (ทุกช่วงระยะมีน้ำหนักเท่ากัน)
"""
from __future__ import annotations

from typing import Sequence

from .distance import haversine_km


def resample_path(
    path: Sequence[Sequence[float]], step_m: float = 500.0
) -> list[tuple[float, float]]:
    """path: [[lat, lon], ...] → จุดทุก ~step_m (รวมจุดเริ่มและจุดปลายเสมอ)"""
    pts = [(float(p[0]), float(p[1])) for p in path]
    if len(pts) < 2:
        return pts

    step_km = step_m / 1000.0
    out: list[tuple[float, float]] = [pts[0]]
    # ระยะที่เดินมาแล้วนับจาก sample ล่าสุด (km)
    carried = 0.0

    for i in range(1, len(pts)):
        lat1, lon1 = pts[i - 1]
        lat2, lon2 = pts[i]
        seg = haversine_km(lat1, lon1, lat2, lon2)
        if seg <= 0:
            continue
        # ตำแหน่ง (km จากต้น segment) ที่ sample ถัดไปจะตกลง
        pos = step_km - carried
        while pos <= seg:
            t = pos / seg
            out.append((lat1 + (lat2 - lat1) * t, lon1 + (lon2 - lon1) * t))
            pos += step_km
        # ระยะเหลือหลัง sample ล่าสุด = ระยะที่เดินต่อโดยยังไม่ครบ step
        carried = seg - (pos - step_km)

    last = pts[-1]
    if out[-1] != last:
        out.append(last)
    return out
