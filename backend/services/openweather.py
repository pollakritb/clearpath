"""OpenWeatherMap — สภาพอากาศปัจจุบัน (อุณหภูมิ/ความชื้น/ลม)

ฟรี 1,000 calls/วัน · ต้องมี API key
"""
from __future__ import annotations

import httpx

from ..core.config import settings
from ..core.errors import ConfigurationError

OWM_URL = "https://api.openweathermap.org/data/2.5/weather"


async def get_weather(lat: float, lon: float) -> dict:
    if not settings.openweather_api_key:
        raise ConfigurationError("ยังไม่ได้ตั้งค่า OPENWEATHER_API_KEY")

    params = {
        "lat": lat,
        "lon": lon,
        "appid": settings.openweather_api_key,
        "units": "metric",
        "lang": "th",
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(OWM_URL, params=params)
        resp.raise_for_status()
        d = resp.json()

    main = d.get("main") or {}
    wind = d.get("wind") or {}
    weather = (d.get("weather") or [{}])[0]
    return {
        "temp": float(main.get("temp", 0.0)),
        "humidity": float(main.get("humidity", 0.0)),
        "wind_speed": float(wind.get("speed", 0.0)),
        "wind_deg": float(wind.get("deg", 0.0)),
        "description": weather.get("description", ""),
        "icon": weather.get("icon"),
    }
