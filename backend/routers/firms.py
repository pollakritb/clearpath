"""GET /api/firms?days= — NASA FIRMS satellite hotspots in Nakhon Pathom."""

from fastapi import APIRouter, Query

from ..models.schemas import FirePoint, FirmsResponse
from ..services import fire_feed

router = APIRouter()


@router.get("/firms", response_model=FirmsResponse)
async def firms(days: int = Query(1, ge=1, le=10)):
    feed = await fire_feed.get_public_fires(days)
    return FirmsResponse(
        fires=[FirePoint(**fire) for fire in feed.fires],
        count=len(feed.fires),
        available=feed.available,
        status=feed.status,
        checked_at=feed.checked_at,
        latest_acquired_at=feed.latest_acquired_at,
        max_age_hours=feed.max_age_hours,
        message=feed.message,
    )
