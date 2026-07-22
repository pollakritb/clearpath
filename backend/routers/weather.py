"""GET /api/weather?lat=&lon= — สภาพอากาศปัจจุบัน (OpenWeatherMap)"""

from fastapi import APIRouter, Query

from ..models.schemas import Weather
from ..services import openweather

router = APIRouter()


@router.get("/weather", response_model=Weather)
async def weather(lat: float = Query(...), lon: float = Query(...)):
    return Weather(**await openweather.get_weather(lat, lon))
