"""Ordinary Kriging (PyKrige) — อัปเกรดจาก IDW เพื่อความแม่นยำเชิงสถิติ

ต่างจาก IDW: Kriging สร้าง variogram จากข้อมูลจริงเพื่อหา "น้ำหนัก" ที่เหมาะสุด
แทนที่จะใช้ 1/d^p ตายตัว → ได้ทั้งค่าประมาณและความไม่แน่นอน (variance)

หมายเหตุ: scipy/pykrige หนัก จึงอยู่ใน requirements-dev (รัน local/รายงาน)
ถ้าไม่ได้ติดตั้ง จะ raise RuntimeError ให้ฝั่ง router fallback ไปใช้ IDW
"""
from __future__ import annotations

from typing import Sequence

import numpy as np

Station = dict


def kriging_score_route(
    waypoints: Sequence[Sequence[float]],
    stations: Sequence[Station],
    variogram_model: str = "exponential",
) -> dict:
    try:
        from pykrige.ok import OrdinaryKriging
    except ImportError as exc:  # pragma: no cover
        raise RuntimeError(
            "PyKrige ไม่ได้ติดตั้ง (อยู่ใน requirements-dev) — ใช้ method=idw แทน"
        ) from exc

    usable = [s for s in stations if s.get("pm25") is not None]
    if len(usable) < 3 or not waypoints:
        raise RuntimeError("ข้อมูลสถานีไม่พอสำหรับ Kriging (ต้อง ≥ 3)")

    lons = np.array([s["lon"] for s in usable], dtype=float)
    lats = np.array([s["lat"] for s in usable], dtype=float)
    vals = np.array([float(s["pm25"]) for s in usable], dtype=float)

    wlat = np.array([w[0] for w in waypoints], dtype=float)
    wlon = np.array([w[1] for w in waypoints], dtype=float)
    try:
        ok = OrdinaryKriging(
            lons, lats, vals,
            variogram_model=variogram_model,
            verbose=False,
            enable_plotting=False,
        )
        z, _ss = ok.execute("points", wlon, wlat)
    except Exception as exc:  # singular matrix (พิกัดซ้ำ) ฯลฯ → ให้ router fallback ไป IDW
        raise RuntimeError(f"Kriging คำนวณไม่สำเร็จ: {exc}") from exc
    z = np.asarray(z, dtype=float)
    z = np.clip(z, 0.0, None)  # PM2.5 ติดลบไม่ได้

    samples = [
        {"lat": float(wlat[i]), "lon": float(wlon[i]), "pm25": round(float(z[i]), 2)}
        for i in range(len(waypoints))
    ]
    return {
        "avg_pm25": round(float(z.mean()), 2),
        "max_pm25": round(float(z.max()), 2),
        "samples": samples,
        "covered": True,
    }


def kriging_value(
    lat: float,
    lon: float,
    stations: Sequence[Station],
    variogram_model: str = "exponential",
) -> "float | None":
    """ทำนายค่า PM2.5 ที่จุดเดียวด้วย Ordinary Kriging (สำหรับ LOOCV)

    คืน None ถ้าทำนายไม่ได้ (pykrige ไม่ติดตั้ง / สถานีน้อย / เมทริกซ์ singular)
    — ตั้งใจไม่ raise เพื่อให้ loocv ข้าม fold ที่ทำนายไม่ได้
    """
    try:
        from pykrige.ok import OrdinaryKriging
    except ImportError:
        return None

    usable = [s for s in stations if s.get("pm25") is not None]
    if len(usable) < 3:
        return None

    lons = np.array([s["lon"] for s in usable], dtype=float)
    lats = np.array([s["lat"] for s in usable], dtype=float)
    vals = np.array([float(s["pm25"]) for s in usable], dtype=float)

    try:
        ok = OrdinaryKriging(
            lons, lats, vals,
            variogram_model=variogram_model,
            verbose=False,
            enable_plotting=False,
        )
        z, _ss = ok.execute(
            "points", np.array([lon], dtype=float), np.array([lat], dtype=float)
        )
        return max(0.0, float(np.asarray(z, dtype=float)[0]))
    except Exception:
        return None
