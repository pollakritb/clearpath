"""Geoapify reverse-geocoding adapter; keys never reach the browser."""

import httpx

from ..algorithms.place_labels import geoapify_label
from ..core.config import settings
from ..core.errors import UpstreamError


async def resolve(lat: float, lon: float) -> dict | None:
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            response = await client.get(
                "https://api.geoapify.com/v1/geocode/reverse",
                params={
                    "lat": lat,
                    "lon": lon,
                    "lang": "th",
                    "format": "json",
                    "limit": 1,
                    "apiKey": settings.geoapify_api_key,
                },
            )
            response.raise_for_status()
            return geoapify_label(response.json(), lat, lon)
    except (httpx.HTTPError, ValueError) as exc:
        raise UpstreamError("ระบุชื่อพื้นที่ไม่สำเร็จ") from exc
