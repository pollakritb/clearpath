"""OpenWeather Air Pollution forecast adapter (server only)."""

from __future__ import annotations

from datetime import UTC, datetime

import httpx

from ..core.config import settings
from ..core.errors import ConfigurationError, UpstreamError
from .provider_http import get_json

URL = "https://api.openweathermap.org/data/2.5/air_pollution/forecast"


def _coordinates(payload: dict) -> tuple[object, object]:
    coord = payload.get("coord") or {}
    if isinstance(coord, dict):
        return coord.get("lat"), coord.get("lon")
    if isinstance(coord, list) and len(coord) >= 2:
        # The Air Pollution response documents the array as [longitude, latitude].
        return coord[1], coord[0]
    return None, None


async def get_forecast(lat: float, lon: float) -> list[dict]:
    if not settings.openweather_air_enabled:
        return []
    if not settings.openweather_api_key:
        raise ConfigurationError("ยังไม่ได้ตั้งค่า OPENWEATHER_API_KEY")
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            payload = await get_json(
                client,
                URL,
                params={"lat": lat, "lon": lon, "appid": settings.openweather_api_key},
            )
    except (httpx.HTTPError, TypeError, ValueError) as exc:
        raise UpstreamError("OpenWeather Air Pollution ตอบกลับไม่สำเร็จ") from exc
    rows = []
    source_lat, source_lon = _coordinates(payload)
    for item in payload.get("list") or []:
        components = item.get("components") or {}
        if item.get("dt") is None or components.get("pm2_5") is None:
            continue
        rows.append(
            {
                "forecast_at": datetime.fromtimestamp(int(item["dt"]), UTC).isoformat(),
                "pm25": float(components["pm2_5"]),
                "source_lat": source_lat,
                "source_lon": source_lon,
            }
        )
    return rows
