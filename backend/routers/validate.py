"""GET /api/validate — ความแม่นยำของการ interpolate ด้วย LOOCV (IDW vs Kriging)

เปรียบเทียบบนข้อมูลสถานีจริงปัจจุบัน → คืน RMSE/MAE/ME/R² ของแต่ละวิธี
ผลถูก cache 5 นาที (คำนวณหนัก โดยเฉพาะ Kriging ที่ fit ใหม่ทุก fold)
"""
from fastapi import APIRouter, Query
from starlette.concurrency import run_in_threadpool

from ..algorithms.validation import (
    loocv,
    loocv_idw,
    loocv_mean,
    loocv_nearest,
    skill_score,
)
from ..core.cache import TTLCache
from ..models.schemas import LoocvMetrics, ValidationResponse
from ..services.stations import get_current_stations

router = APIRouter()

_cache = TTLCache(ttl_seconds=300)


def _kriging_loocv(pts: list[dict]) -> dict:
    # import ที่นี่เพื่อไม่ให้ module-level พึ่ง pykrige (deploy ไม่มี)
    from ..algorithms.kriging import kriging_value

    return loocv(pts, kriging_value)


@router.get("/validate", response_model=ValidationResponse)
async def validate(method: str = Query("both", pattern="^(idw|kriging|both)$")):
    cached = _cache.get(method)
    if cached is not None:
        return cached

    rows, _src = await get_current_stations()
    pts = [{"lat": r["lat"], "lon": r["lon"], "pm25": r.get("pm25")} for r in rows]
    usable_count = sum(1 for p in pts if p["pm25"] is not None)

    # baselines เสมอ (ใช้คิด skill score)
    mean_m = await run_in_threadpool(loocv_mean, pts)
    near_m = await run_in_threadpool(loocv_nearest, pts)
    base_rmse = mean_m.get("rmse")

    idw_m = None
    krig_m = None
    if method in ("idw", "both"):
        idw_m = await run_in_threadpool(loocv_idw, pts)
    if method in ("kriging", "both"):
        try:
            krig_m = await run_in_threadpool(_kriging_loocv, pts)
        except Exception:
            krig_m = None  # pykrige ไม่พร้อม → ข้าม (ฝั่ง UI แสดง "ไม่พร้อม")

    def _with_skill(m: "dict | None") -> "LoocvMetrics | None":
        if not m or not m.get("n"):
            return None
        return LoocvMetrics(**m, skill=skill_score(m.get("rmse"), base_rmse))

    # ใครแม่นกว่า (RMSE ต่ำกว่า) ระหว่าง IDW vs Kriging
    # เทียบ IDW vs Kriging ได้ต่อเมื่อทดสอบบนชุด fold เดียวกัน (n เท่ากัน)
    better = None
    if (
        idw_m and krig_m
        and idw_m.get("rmse") is not None
        and krig_m.get("rmse") is not None
        and idw_m.get("n") == krig_m.get("n")
    ):
        diff = idw_m["rmse"] - krig_m["rmse"]
        better = "tie" if abs(diff) < 5e-4 else ("idw" if diff < 0 else "kriging")

    resp = ValidationResponse(
        idw=_with_skill(idw_m),
        kriging=_with_skill(krig_m),
        mean=LoocvMetrics(**mean_m, skill=0.0) if mean_m.get("n") else None,
        nearest=_with_skill(near_m),
        station_count=usable_count,
        better=better,
    )
    _cache.set(method, resp)
    return resp
