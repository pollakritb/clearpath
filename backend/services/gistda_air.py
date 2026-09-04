"""GISTDA ChekFoon PM2.5 forecast adapter (server only, permission gated)."""

from __future__ import annotations

from datetime import UTC, datetime

import httpx

from ..core.config import settings
from ..core.errors import ConfigurationError, UpstreamError

URL = "https://pm25.gistda.or.th/rest/pred/getPm25byLocation"


def _as_utc(value: object) -> str:
    parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC).isoformat()


async def get_forecast(lat: float, lon: float) -> list[dict]:
    if not settings.gistda_air_enabled:
        return []
    if not settings.gistda_license_approved:
        raise ConfigurationError("GISTDA forecast ถูกปิดจนกว่าจะยืนยันสิทธิ์การใช้และเผยแพร่ข้อมูล")
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.get(URL, params={"lat": lat, "lng": lon})
            response.raise_for_status()
            payload = response.json()
    except (httpx.HTTPError, TypeError, ValueError) as exc:
        raise UpstreamError("GISTDA เช็คฝุ่นตอบกลับไม่สำเร็จ") from exc
    if int(payload.get("status") or 0) != 200:
        raise UpstreamError("GISTDA เช็คฝุ่นส่งสถานะข้อมูลไม่สำเร็จ")
    data = payload.get("data") or {}
    rows = []
    for item in data.get("graphPredictByHrs") or []:
        try:
            value, forecast_at = item[0], item[1]
            pm25 = float(value)
            if pm25 < 0:
                continue
            rows.append({"forecast_at": _as_utc(forecast_at), "pm25": pm25})
        except (IndexError, TypeError, ValueError):
            continue
    if not rows:
        raise UpstreamError("GISTDA เช็คฝุ่นไม่ส่งค่าพยากรณ์ PM2.5 ที่ใช้ได้")
    return rows
