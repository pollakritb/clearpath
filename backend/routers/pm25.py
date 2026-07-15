"""GET /api/pm25/current — สถานี + ค่า PM2.5 ล่าสุด

อ่านจาก Supabase ถ้าตั้งค่าไว้ ไม่งั้น fallback ดึงสดจาก air4thai (ดูได้ทันทีไม่ต้องตั้งค่า)
"""
from fastapi import APIRouter

from ..models.schemas import Station, StationsResponse
from ..services.stations import get_current_stations

router = APIRouter()


@router.get("/pm25/current", response_model=StationsResponse)
async def current_pm25():
    rows, _source = await get_current_stations()
    stations = [Station(**{k: r.get(k) for k in Station.model_fields}) for r in rows]
    updates = [r.get("updated_at") for r in rows if r.get("updated_at")]
    updated = max(updates) if updates else None
    return StationsResponse(stations=stations, count=len(stations), updated_at=updated)
