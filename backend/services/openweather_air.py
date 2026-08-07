"""OpenWeather Air Pollution forecast adapter (server only)."""

from __future__ import annotations

from datetime import UTC, datetime

import httpx

from ..core.config import settings
from ..core.errors import ConfigurationError, UpstreamError

URL = "https://api.openweathermap.org/data/2.5/air_pollution/forecast"


async def get_forecast(lat: float, lon: float) -> list[dict]:
    if not settings.openweather_air_enabled:
        return []
    if not settings.openweather_api_key:
        raise ConfigurationError("ยังไม่ได้ตั้งค่า OPENWEATHER_API_KEY")
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.get(
                URL,
                params={"lat": lat, "lon": lon, "appid": settings.openweather_api_key},
            )
            response.raise_for_status()
            payload = response.json()
    except (httpx.HTTPError, TypeError, ValueError) as exc:
        raise UpstreamError("OpenWeather Air Pollution ตอบกลับไม่สำเร็จ") from exc
    rows = []
    for item in payload.get("list") or []:
        components = item.get("components") or {}
        if item.get("dt") is None or components.get("pm2_5") is None:
            continue
        rows.append(
            {
                "forecast_at": datetime.fromtimestamp(int(item["dt"]), UTC).isoformat(),
                "pm25": float(components["pm2_5"]),
            }
        )
    return rows
