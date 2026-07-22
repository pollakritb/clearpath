"""GET /api/pm25/current — สถานี + ค่า PM2.5 ล่าสุด

อ่านจาก Supabase ที่ sync จาก air4thai รายชั่วโมง เพื่อให้ข้อมูลทุกฟีเจอร์เป็น snapshot เดียวกัน
"""

from fastapi import APIRouter

from ..algorithms.freshness import station_freshness
from ..models.schemas import Station, StationsResponse
from ..services.stations import get_current_stations

router = APIRouter()


@router.get("/pm25/current", response_model=StationsResponse)
async def current_pm25():
    rows, _source = await get_current_stations()
    prepared = []
    for row in rows:
        freshness = station_freshness(row.get("recorded_at"))
        prepared.append(
            {
                **row,
                **freshness,
                "eligible_for_surface": freshness["eligible_for_surface"]
                and row.get("pm25") is not None,
            }
        )
    stations = [
        Station(**{k: r.get(k) for k in Station.model_fields}) for r in prepared
    ]
    updates = [r.get("updated_at") for r in rows if r.get("updated_at")]
    updated = max(updates) if updates else None
    return StationsResponse(
        stations=stations,
        count=len(stations),
        updated_at=updated,
        fresh_count=sum(station.data_status == "fresh" for station in stations),
        delayed_count=sum(station.data_status == "delayed" for station in stations),
        expired_count=sum(station.data_status == "expired" for station in stations),
    )
