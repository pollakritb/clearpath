"""Historical PM2.5 endpoints for station charts and the public map."""

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Query

from ..models.schemas import HistoryPoint, HistoryResponse, MapHistoryResponse, Station
from ..services import supabase_client
from ..services.map_history import get_map_history

router = APIRouter()


@router.get("/history", response_model=HistoryResponse)
def history(
    station_id: str = Query(...),
    hours: int = Query(24, ge=1, le=720),
):
    rows = supabase_client.get_history(station_id, hours)
    points = [
        HistoryPoint(**{k: r.get(k) for k in HistoryPoint.model_fields}) for r in rows
    ]
    return HistoryResponse(station_id=station_id, points=points)


@router.get("/history/map", response_model=MapHistoryResponse)
async def map_history(
    at: datetime = Query(...),
    max_age_minutes: int = Query(90, ge=30, le=180),
):
    target = at if at.tzinfo else at.replace(tzinfo=UTC)
    now = datetime.now(UTC)
    if target > now + timedelta(minutes=5):
        target = now
    earliest = now - timedelta(hours=24)
    if target < earliest:
        target = earliest
    rows = await get_map_history(target, max_age_minutes=max_age_minutes)
    stations = [
        Station(**{key: row.get(key) for key in Station.model_fields}) for row in rows
    ]
    return MapHistoryResponse(
        target_at=target.astimezone(UTC).isoformat(),
        stations=stations,
        count=len(stations),
        max_age_minutes=max_age_minutes,
    )
