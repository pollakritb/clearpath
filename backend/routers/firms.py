"""GET /api/firms?days= — NASA FIRMS thermal anomalies in Nakhon Pathom."""

from fastapi import APIRouter, Query

from ..algorithms.area import is_nakhon_pathom
from ..models.schemas import FirePoint, FirmsResponse
from ..services import fire_feed

router = APIRouter()


@router.get("/firms", response_model=FirmsResponse)
async def firms(days: int = Query(1, ge=1, le=10)):
    feed = await fire_feed.get_public_fires(days)
    fires = [
        fire
        for fire in feed.fires
        if is_nakhon_pathom(float(fire["lat"]), float(fire["lon"]))
    ]
    return FirmsResponse(
        fires=[FirePoint(**f) for f in fires],
        count=len(fires),
        available=feed.available,
        message=feed.message,
    )
