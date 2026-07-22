"""GET /api/firms?days= — NASA FIRMS thermal anomalies in Nakhon Pathom."""

from fastapi import APIRouter, Query

from ..algorithms.area import is_nakhon_pathom
from ..models.schemas import FirePoint, FirmsResponse
from ..services import firms as firms_service

router = APIRouter()


@router.get("/firms", response_model=FirmsResponse)
async def firms(days: int = Query(1, ge=1, le=10)):
    fires = [
        fire
        for fire in await firms_service.get_fires(days)
        if is_nakhon_pathom(float(fire["lat"]), float(fire["lon"]))
    ]
    return FirmsResponse(fires=[FirePoint(**f) for f in fires], count=len(fires))
