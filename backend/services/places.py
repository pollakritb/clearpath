"""Place search: Geoapify, or manual Nominatim search in local development."""

from __future__ import annotations

import asyncio
import logging
import time
from datetime import UTC, datetime, timedelta
from threading import Lock

import httpx

from ..core.config import settings
from .gazetteer import search_locations

logger = logging.getLogger("clearpath.places")
AUTOCOMPLETE_URL = "https://api.geoapify.com/v1/geocode/autocomplete"
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
_cache: dict[tuple[str, int], tuple[datetime, list[dict]]] = {}
_cache_lock = Lock()
_nominatim_lock = asyncio.Lock()
_last_nominatim_request = 0.0


def _local_results(query: str, limit: int) -> list[dict]:
    return [
        {
            "id": row["id"],
            "name": row["name"],
            "address": f"{row['district']}, นครปฐม",
            "kind": row["kind"],
            "source": "local",
            "lat": row["lat"],
            "lon": row["lon"],
        }
        for row in search_locations(query, limit)
    ]


def _parse_results(payload: dict, limit: int) -> list[dict]:
    places: list[dict] = []
    seen: set[str] = set()
    if not isinstance(payload, dict) or not isinstance(payload.get("results"), list):
        raise ValueError("invalid_place_search_response")
    for row in payload.get("results", []):
        if (
            not isinstance(row, dict)
            or str(row.get("country_code") or "").lower() != "th"
        ):
            continue
        try:
            lat, lon = float(row["lat"]), float(row["lon"])
        except (KeyError, TypeError, ValueError):
            continue
        if not (5 <= lat <= 21 and 97 <= lon <= 106):
            continue
        name = str(row.get("name") or row.get("address_line1") or "").strip()
        address = str(row.get("formatted") or row.get("address_line2") or "").strip()
        place_id = str(row.get("place_id") or f"{lat:.6f},{lon:.6f}")
        if not name or place_id in seen:
            continue
        seen.add(place_id)
        places.append(
            {
                "id": f"geoapify:{place_id}",
                "name": name,
                "address": address,
                "kind": str(row.get("result_type") or "place"),
                "source": "geoapify",
                "lat": lat,
                "lon": lon,
            }
        )
        if len(places) >= limit:
            break
    return places


def _parse_nominatim_results(payload: list, limit: int) -> list[dict]:
    if not isinstance(payload, list):
        raise ValueError("invalid_place_search_response")
    places: list[dict] = []
    for row in payload:
        if not isinstance(row, dict):
            continue
        try:
            lat, lon = float(row["lat"]), float(row["lon"])
        except (KeyError, TypeError, ValueError):
            continue
        if not (5 <= lat <= 21 and 97 <= lon <= 106):
            continue
        display = str(row.get("display_name") or "").strip()
        name = str(row.get("name") or display.split(",", 1)[0]).strip()
        if not name:
            continue
        places.append(
            {
                "id": f"osm:{row.get('osm_type', 'place')}:{row.get('osm_id', f'{lat},{lon}')}",
                "name": name,
                "address": display,
                "kind": str(row.get("type") or "place"),
                "source": "openstreetmap",
                "lat": lat,
                "lon": lon,
            }
        )
        if len(places) >= limit:
            break
    return places


async def _search_nominatim(query: str, limit: int) -> list[dict]:
    """User-triggered only; never call this from autocomplete or a scheduled job."""
    global _last_nominatim_request
    async with _nominatim_lock:
        await asyncio.sleep(max(0, 1.1 - (time.monotonic() - _last_nominatim_request)))
        _last_nominatim_request = time.monotonic()
        async with httpx.AsyncClient(timeout=8.0) as client:
            response = await client.get(
                NOMINATIM_URL,
                params={
                    "q": query,
                    "format": "jsonv2",
                    "countrycodes": "th",
                    "addressdetails": 1,
                    "limit": limit,
                    "accept-language": "th,en",
                },
                headers={
                    "User-Agent": "ClearPath-local-development/1.0 (https://github.com/pollakritb/clearpath)"
                },
            )
            response.raise_for_status()
            return _parse_nominatim_results(response.json(), limit)


async def search_places(query: str, limit: int = 10) -> tuple[list[dict], str]:
    if not settings.geoapify_api_key and settings.app_environment != "development":
        return _local_results(query, limit), "limited"
    cache_key = (" ".join(query.casefold().split()), limit)
    now = datetime.now(UTC)
    with _cache_lock:
        cached = _cache.get(cache_key)
        if cached and now - cached[0] < timedelta(hours=1):
            return cached[1], "nationwide"
    try:
        if settings.geoapify_api_key:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(
                    AUTOCOMPLETE_URL,
                    params={
                        "text": query,
                        "filter": "countrycode:th",
                        "lang": "th",
                        "limit": limit,
                        "format": "json",
                        "apiKey": settings.geoapify_api_key,
                    },
                )
                response.raise_for_status()
                places = _parse_results(response.json(), limit)
        else:
            places = await _search_nominatim(query, limit)
        with _cache_lock:
            if len(_cache) >= 200:
                _cache.pop(next(iter(_cache)))
            _cache[cache_key] = (now, places)
        return places, "nationwide"
    except (httpx.HTTPError, ValueError, TypeError):
        logger.warning("place_search_unavailable")
        return _local_results(query, limit), "limited"
