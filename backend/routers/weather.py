"""GET /api/weather?lat=&lon= — current weather with provider fallback."""

from fastapi import APIRouter, Query

from ..models.schemas import Weather
from ..services import weather_service

router = APIRouter()


@router.get("/weather", response_model=Weather)
async def weather(lat: float = Query(...), lon: float = Query(...)):
    return Weather(**await weather_service.get_weather(lat, lon))
