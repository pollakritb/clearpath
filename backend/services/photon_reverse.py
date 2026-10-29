"""Low-volume Photon reverse geocoding over OpenStreetMap data."""

import httpx

from ..algorithms.place_labels import photon_label
from ..core.errors import UpstreamError


async def resolve(lat: float, lon: float) -> dict | None:
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            response = await client.get(
                "https://photon.komoot.io/reverse",
                params={"lat": lat, "lon": lon, "radius": 0.3, "limit": 1},
                headers={
                    "User-Agent": "ClearPath/1.0 (https://github.com/pollakritb/clearpath)",
                    "Accept-Language": "th",
                },
            )
            response.raise_for_status()
            return photon_label(response.json(), lat, lon)
    except (httpx.HTTPError, ValueError) as exc:
        raise UpstreamError("ระบุชื่อพื้นที่ไม่สำเร็จ") from exc
