"""OpenWeatherMap — สภาพอากาศปัจจุบัน (อุณหภูมิ/ความชื้น/ลม)

ฟรี 1,000 calls/วัน · ต้องมี API key
"""

from __future__ import annotations

from datetime import UTC, datetime

import httpx

from ..core.config import settings
from ..core.errors import ConfigurationError, UpstreamError

OWM_URL = "https://api.openweathermap.org/data/2.5/weather"
OWM_FORECAST_URL = "https://api.openweathermap.org/data/2.5/forecast"


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
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(OWM_URL, params=params)
            resp.raise_for_status()
            d = resp.json()
    except (httpx.HTTPError, ValueError, TypeError) as exc:
        raise UpstreamError("OpenWeather ตอบกลับไม่สำเร็จหรือข้อมูลไม่ถูกต้อง") from exc

    main = d.get("main") or {}
    wind = d.get("wind") or {}
    weather = (d.get("weather") or [{}])[0]
    rain = d.get("rain") or {}
    return {
        "temp": float(main.get("temp", 0.0)),
        "humidity": float(main.get("humidity", 0.0)),
        "wind_speed": float(wind.get("speed", 0.0)),
        "wind_deg": float(wind.get("deg", 0.0)),
        "description": weather.get("description", ""),
        "icon": weather.get("icon"),
        "rain_mm": float(rain.get("1h") or rain.get("3h") or 0),
    }


async def get_forecast(lat: float, lon: float) -> list[dict]:
    if not settings.openweather_api_key:
        raise ConfigurationError("ยังไม่ได้ตั้งค่า OPENWEATHER_API_KEY")
    params = {
        "lat": lat,
        "lon": lon,
        "appid": settings.openweather_api_key,
        "units": "metric",
        "lang": "th",
    }
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.get(OWM_FORECAST_URL, params=params)
            resp.raise_for_status()
            payload = resp.json()
    except (httpx.HTTPError, ValueError, TypeError) as exc:
        raise UpstreamError("OpenWeather forecast ตอบกลับไม่สำเร็จ") from exc
    rows = []
    for item in payload.get("list") or []:
        main = item.get("main") or {}
        wind = item.get("wind") or {}
        rain = item.get("rain") or {}
        if not item.get("dt"):
            continue
        rows.append(
            {
                "forecast_at": datetime.fromtimestamp(int(item["dt"]), UTC).isoformat(),
                "temperature": float(main.get("temp") or 0),
                "humidity": float(main.get("humidity") or 0),
                "wind_speed": float(wind.get("speed") or 0),
                "wind_deg": float(wind.get("deg") or 0),
                "rain_mm": float(rain.get("3h") or 0),
            }
        )
    return rows
