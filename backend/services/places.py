"""Place search with a Geoapify key or a cached, low-volume Photon fallback."""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from threading import Lock

import httpx

from ..core.config import settings
from .gazetteer import search_locations

logger = logging.getLogger("clearpath.places")
AUTOCOMPLETE_URL = "https://api.geoapify.com/v1/geocode/autocomplete"
PHOTON_URL = "https://photon.komoot.io/api/"
_cache: dict[tuple[str, int], tuple[datetime, list[dict]]] = {}
_cache_lock = Lock()


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


def _parse_photon_results(payload: dict, limit: int) -> list[dict]:
    if not isinstance(payload, dict) or not isinstance(payload.get("features"), list):
        raise ValueError("invalid_place_search_response")
    places: list[dict] = []
    seen: set[str] = set()
    for feature in payload["features"]:
        if not isinstance(feature, dict):
            continue
        properties = feature.get("properties")
        geometry = feature.get("geometry")
        if not isinstance(properties, dict) or not isinstance(geometry, dict):
            continue
        if str(properties.get("countrycode") or "").upper() != "TH":
            continue
        coordinates = geometry.get("coordinates")
        if not isinstance(coordinates, list) or len(coordinates) < 2:
            continue
        try:
            lon, lat = float(coordinates[0]), float(coordinates[1])
        except (TypeError, ValueError):
            continue
        if not (5 <= lat <= 21 and 97 <= lon <= 106):
            continue
        name = str(properties.get("name") or "").strip()
        if not name:
            continue
        area = [
            str(properties[key]).strip()
            for key in ("street", "locality", "district", "city", "state")
            if properties.get(key)
        ]
        address = ", ".join(dict.fromkeys([*area, "ประเทศไทย"]))
        place_id = f"{properties.get('osm_type', 'place')}:{properties.get('osm_id', f'{lat},{lon}')}"
        if place_id in seen:
            continue
        seen.add(place_id)
        places.append(
            {
                "id": f"photon:{place_id}",
                "name": name,
                "address": address,
                "kind": str(
                    properties.get("osm_value") or properties.get("type") or "place"
                ),
                "source": "photon",
                "lat": lat,
                "lon": lon,
            }
        )
        if len(places) >= limit:
            break
    return places


async def _search_photon(query: str, limit: int) -> list[dict]:
    async with httpx.AsyncClient(timeout=6.0) as client:
        response = await client.get(
            PHOTON_URL,
            params={"q": query, "countrycode": "TH", "limit": limit},
            headers={
                "User-Agent": "ClearPath/1.0 (https://github.com/pollakritb/clearpath)"
            },
        )
        response.raise_for_status()
        return _parse_photon_results(response.json(), limit)


async def search_places(query: str, limit: int = 10) -> tuple[list[dict], str]:
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
            places = await _search_photon(query, limit)
        with _cache_lock:
            if len(_cache) >= 200:
                _cache.pop(next(iter(_cache)))
            _cache[cache_key] = (now, places)
        return places, "nationwide"
    except (httpx.HTTPError, ValueError, TypeError):
        logger.warning("place_search_unavailable")
        return _local_results(query, limit), "limited"
