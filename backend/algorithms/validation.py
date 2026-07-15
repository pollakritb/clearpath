"""Leave-One-Out Cross-Validation (LOOCV) — วัดความแม่นยำของการ interpolate

วิธี: สำหรับแต่ละสถานี i ที่มีค่าจริง → "ถอด" สถานีนั้นออก แล้วทำนายค่าที่ตำแหน่งของมัน
จากสถานีที่เหลือ (IDW หรือ Kriging) → เทียบค่าทำนายกับค่าจริง → รวมเป็น error metrics

Metrics:
- MAE  = ค่าเฉลี่ยความคลาดเคลื่อนสัมบูรณ์ (µg/m³)
- RMSE = รากของค่าเฉลี่ยกำลังสองความคลาดเคลื่อน (ลงโทษ error ใหญ่มากกว่า MAE)
- ME   = ค่าเฉลี่ยความคลาดเคลื่อน (bias: + = ทำนายสูงไป, - = ต่ำไป)
- R²   = สัมประสิทธิ์การตัดสินใจ (1 = สมบูรณ์แบบ, 0 = เท่ากับเดาค่าเฉลี่ย, ติดลบ = แย่กว่าค่าเฉลี่ย)

pure (ไม่มี I/O) — รับ predict_fn เข้ามา จึงใช้ได้ทั้ง IDW และ Kriging และทดสอบง่าย
"""
from __future__ import annotations

import math
from typing import Callable, Optional, Sequence

from .distance import haversine_km
from .idw import idw_value

Station = dict
# predict_fn(lat, lon, training_stations) -> ค่าทำนาย (หรือ None ถ้าทำนายไม่ได้)
PredictFn = Callable[[float, float, Sequence[Station]], Optional[float]]


def _metrics(actuals: list[float], preds: list[float]) -> dict:
    m = len(actuals)
    if m < 3:
        return {"n": m, "mae": None, "rmse": None, "me": None, "r2": None}

    errs = [p - a for p, a in zip(preds, actuals)]
    mae = sum(abs(e) for e in errs) / m
    rmse = math.sqrt(sum(e * e for e in errs) / m)
    me = sum(errs) / m

    mean_a = sum(actuals) / m
    ss_res = sum((a - p) ** 2 for a, p in zip(actuals, preds))
    ss_tot = sum((a - mean_a) ** 2 for a in actuals)
    r2 = (1.0 - ss_res / ss_tot) if ss_tot > 0 else None

    return {
        "n": m,
        "mae": round(mae, 3),
        "rmse": round(rmse, 3),
        "me": round(me, 3),
        "r2": round(r2, 4) if r2 is not None else None,
    }


def loocv_pairs(
    stations: Sequence[Station], predict_fn: PredictFn
) -> tuple[list[float], list[float]]:
    """คืน (ค่าจริง, ค่าทำนาย) ของทุก fold — ใช้ทำ scatter / วิเคราะห์ต่อ"""
    usable = [s for s in stations if s.get("pm25") is not None]
    actuals: list[float] = []
    preds: list[float] = []
    for i in range(len(usable)):
        others = usable[:i] + usable[i + 1 :]
        if not others:
            continue
        p = predict_fn(usable[i]["lat"], usable[i]["lon"], others)
        if p is None:
            continue
        actuals.append(float(usable[i]["pm25"]))
        preds.append(float(p))
    return actuals, preds


def loocv(stations: Sequence[Station], predict_fn: PredictFn) -> dict:
    """รัน LOOCV ด้วย predict_fn ที่ให้มา คืน metrics dict"""
    actuals, preds = loocv_pairs(stations, predict_fn)
    return _metrics(actuals, preds)


def loocv_idw(stations: Sequence[Station], power: float = 2.0, k: int = 5) -> dict:
    return loocv(
        stations,
        lambda lat, lon, others: idw_value(lat, lon, others, power, k),
    )


# ── baselines (เกณฑ์เปรียบเทียบว่า interpolation "คุ้มความซับซ้อน" ไหม) ──
def _mean_predict(lat: float, lon: float, others: Sequence[Station]) -> Optional[float]:
    vals = [float(s["pm25"]) for s in others if s.get("pm25") is not None]
    return sum(vals) / len(vals) if vals else None


def _nearest_predict(lat: float, lon: float, others: Sequence[Station]) -> Optional[float]:
    usable = [s for s in others if s.get("pm25") is not None]
    if not usable:
        return None
    nearest = min(usable, key=lambda s: haversine_km(lat, lon, s["lat"], s["lon"]))
    return float(nearest["pm25"])


def loocv_mean(stations: Sequence[Station]) -> dict:
    """baseline: เดาด้วยค่าเฉลี่ยของสถานีที่เหลือ (leave-one-out mean — ไม่ใช้ตำแหน่ง)"""
    return loocv(stations, _mean_predict)


def loocv_nearest(stations: Sequence[Station]) -> dict:
    """baseline: ใช้ค่าสถานีที่ใกล้ที่สุด (Thiessen / nearest-neighbour)"""
    return loocv(stations, _nearest_predict)


def skill_score(method_rmse: Optional[float], baseline_rmse: Optional[float]) -> Optional[float]:
    """Skill = 1 - RMSE_method / RMSE_baseline
    > 0 = ดีกว่า baseline · = 0 เท่ากัน · < 0 แย่กว่า
    """
    if method_rmse is None or baseline_rmse is None or baseline_rmse == 0:
        return None  # ป้องกัน None / หารศูนย์ (RMSE=0 ของวิธีที่สมบูรณ์แบบ → skill=1.0 ถูกต้อง)
    return round(1.0 - method_rmse / baseline_rmse, 4)
