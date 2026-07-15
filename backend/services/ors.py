"""OpenRouteService — ขอ 2 เส้นทาง (หลัก + ทางเลือก) ระหว่างต้นทาง-ปลายทาง

ฟรี 2,000 req/วัน · ต้องมี API key
หมายเหตุ: พารามิเตอร์จริงคือ `alternative_routes` (ไม่ใช่ `alternatives: true` ตาม blueprint)
"""
from __future__ import annotations

import httpx

from ..core.cache import TTLCache
from ..core.config import settings
from ..core.errors import ConfigurationError

ORS_URL = "https://api.openrouteservice.org/v2/directions/driving-car/geojson"

# เส้นทางระหว่างจุดเดิมไม่เปลี่ยน → cache 30 นาที (ลดโควต้า 2,000 req/วัน)
_cache = TTLCache(ttl_seconds=1800)


async def get_routes(
    start: tuple[float, float],
    end: tuple[float, float],
    target_count: int = 2,
) -> list[dict]:
    """start/end = (lat, lon). คืน list ของ {geometry:[[lat,lon]...], distance_m, duration_s}"""
    if not settings.ors_api_key:
        raise ConfigurationError("ยังไม่ได้ตั้งค่า ORS_API_KEY")

    cache_key = (
        round(start[0], 5),
        round(start[1], 5),
        round(end[0], 5),
        round(end[1], 5),
        target_count,
    )
    cached = _cache.get(cache_key)
    if cached is not None:
        return cached

    body = {
        "coordinates": [[start[1], start[0]], [end[1], end[0]]],  # ORS ใช้ [lon, lat]
        "alternative_routes": {
            "target_count": target_count,
            "weight_factor": 1.6,
            "share_factor": 0.6,
        },
        "instructions": False,
    }
    headers = {
        "Authorization": settings.ors_api_key,
        "Content-Type": "application/json",
        "Accept": "application/geo+json",
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(ORS_URL, json=body, headers=headers)
        resp.raise_for_status()
        data = resp.json()

    routes: list[dict] = []
    for feat in data.get("features", []):
        coords = (feat.get("geometry") or {}).get("coordinates") or []  # [[lon,lat]...]
        summary = (feat.get("properties") or {}).get("summary") or {}
        routes.append(
            {
                "geometry": [[c[1], c[0]] for c in coords],  # → [[lat, lon]...]
                "distance_m": float(summary.get("distance", 0.0)),
                "duration_s": float(summary.get("duration", 0.0)),
            }
        )
    _cache.set(cache_key, routes)
    return routes
