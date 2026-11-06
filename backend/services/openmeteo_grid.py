"""CAMS grid adapter: retain nulls and returned grid coordinates."""

from datetime import UTC, datetime, timedelta

import httpx

from ..algorithms.cams_grid import normalize_batch
from ..core.errors import UpstreamError
from .openmeteo_air import URL
from .provider_http import get_json


async def fetch_batch(points: list[dict], *, start_at: str | None = None) -> dict:
    anchor = (
        datetime.fromisoformat(start_at.replace("Z", "+00:00"))
        if start_at
        else datetime.now(UTC)
    )
    if anchor.tzinfo is None:
        raise ValueError("grid reference must include timezone")
    anchor = anchor.astimezone(UTC).replace(minute=0, second=0, microsecond=0)
    # Pin every checkpoint to the same interval, including the final anchor fetch.
    # forecast_days begins at midnight and silently includes past hours.
    interval = {
        "start_hour": anchor.strftime("%Y-%m-%dT%H:%M"),
        "end_hour": (anchor + timedelta(hours=119)).strftime("%Y-%m-%dT%H:%M"),
    }
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
                    **interval,
                },
            )
        return normalize_batch(payload, points)
    except (httpx.HTTPError, KeyError, TypeError, ValueError) as exc:
        raise UpstreamError("ข้อมูลกริด CAMS ไม่สมบูรณ์หรือรูปแบบกริดเปลี่ยนไป") from exc
