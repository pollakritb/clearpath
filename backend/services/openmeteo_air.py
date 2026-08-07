"""Open-Meteo/CAMS PM2.5 forecast adapter with bounded coordinate batches."""

from __future__ import annotations

from datetime import UTC, datetime

import httpx

from ..core.config import settings
from ..core.errors import UpstreamError

URL = "https://air-quality-api.open-meteo.com/v1/air-quality"


def _as_utc(value: str) -> str:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC).isoformat()


async def get_forecasts(
    stations: list[dict], forecast_days: int = 4
) -> dict[str, list[dict]]:
    if not settings.openmeteo_air_enabled or not stations:
        return {}
    max_batch = max(1, min(50, settings.forecast_provider_max_batch_size))
    result: dict[str, list[dict]] = {}
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            for offset in range(0, len(stations), max_batch):
                batch = stations[offset : offset + max_batch]
                response = await client.get(
                    URL,
                    params={
                        "latitude": ",".join(str(float(row["lat"])) for row in batch),
                        "longitude": ",".join(str(float(row["lon"])) for row in batch),
                        "hourly": "pm2_5",
                        "timezone": "UTC",
                        "forecast_days": max(1, min(7, forecast_days)),
                    },
                )
                response.raise_for_status()
                payload = response.json()
                locations = payload if isinstance(payload, list) else [payload]
                if len(locations) != len(batch):
                    raise ValueError("openmeteo_location_count_mismatch")
                for station, location in zip(batch, locations, strict=True):
                    hourly = location.get("hourly") or {}
                    times = hourly.get("time") or []
                    values = hourly.get("pm2_5") or []
                    result[str(station["id"])] = [
                        {"forecast_at": _as_utc(str(at)), "pm25": float(value)}
                        for at, value in zip(times, values, strict=False)
                        if value is not None
                    ]
    except (httpx.HTTPError, TypeError, ValueError) as exc:
        raise UpstreamError("Open-Meteo/CAMS ตอบกลับไม่สำเร็จหรือข้อมูลไม่ถูกต้อง") from exc
    return result
