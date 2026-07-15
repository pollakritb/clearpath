"""Nominatim (OpenStreetMap) — geocoding: แปลงชื่อสถานที่ → พิกัด

ฟรี ไม่ต้อง key · fair-use 1 req/วินาที · ต้องส่ง User-Agent ที่ระบุตัวตน
"""
from __future__ import annotations

import httpx

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"


async def geocode(query: str, limit: int = 5) -> list[dict]:
    params = {
        "q": query,
        "format": "json",
        "limit": limit,
        "countrycodes": "th",
        "accept-language": "th",
    }
    headers = {"User-Agent": "ClearPath/1.0 (final-year-project; contact: clearpath)"}
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(NOMINATIM_URL, params=params, headers=headers)
        resp.raise_for_status()
        data = resp.json()

    results: list[dict] = []
    for item in data:
        try:
            results.append(
                {
                    "lat": float(item["lat"]),
                    "lon": float(item["lon"]),
                    "label": item.get("display_name", query),
                }
            )
        except (KeyError, TypeError, ValueError):
            continue
    return results
