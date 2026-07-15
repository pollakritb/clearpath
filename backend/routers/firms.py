"""GET /api/firms?days= — จุดไฟไหม้ป่า (NASA FIRMS) ในกรอบประเทศไทย"""
from fastapi import APIRouter, Query

from ..models.schemas import FirePoint, FirmsResponse
from ..services import firms as firms_service

router = APIRouter()


@router.get("/firms", response_model=FirmsResponse)
async def firms(days: int = Query(1, ge=1, le=10)):
    fires = await firms_service.get_fires(days)
    return FirmsResponse(fires=[FirePoint(**f) for f in fires], count=len(fires))
