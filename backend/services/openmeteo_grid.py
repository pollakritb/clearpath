"""CAMS grid adapter: retain nulls and returned grid coordinates."""

import httpx

from ..algorithms.cams_grid import normalize_batch
from ..core.errors import UpstreamError
from .openmeteo_air import URL
from .provider_http import get_json


async def fetch_batch(points: list[dict]) -> dict:
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(12, connect=4)) as client:
            payload = await get_json(
                client,
                URL,
                params={
                    "latitude": ",".join(str(p["lat"]) for p in points),
                    "longitude": ",".join(str(p["lon"]) for p in points),
                    "hourly": "pm2_5",
                    "domains": "cams_global",
                    "cell_selection": "nearest",
                    "timezone": "UTC",
                    "forecast_days": 5,
                },
            )
        return normalize_batch(payload, points)
    except (httpx.HTTPError, KeyError, TypeError, ValueError) as exc:
        raise UpstreamError("ข้อมูลกริด CAMS ไม่สมบูรณ์หรือรูปแบบกริดเปลี่ยนไป") from exc
