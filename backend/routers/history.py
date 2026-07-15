"""GET /api/history?station_id=&hours= — ประวัติ PM2.5 ของสถานี (กราฟย้อนหลัง)"""
from fastapi import APIRouter, Query

from ..models.schemas import HistoryPoint, HistoryResponse
from ..services import supabase_client

router = APIRouter()


@router.get("/history", response_model=HistoryResponse)
def history(
    station_id: str = Query(...),
    hours: int = Query(24, ge=1, le=720),
):
    rows = supabase_client.get_history(station_id, hours)
    points = [HistoryPoint(**{k: r.get(k) for k in HistoryPoint.model_fields}) for r in rows]
    return HistoryResponse(station_id=station_id, points=points)
