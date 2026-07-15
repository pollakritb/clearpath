"""NASA FIRMS — จุดความร้อน/ไฟไหม้ป่า (VIIRS NRT) ในกรอบประเทศไทย

ฟรี · ต้องมี MAP_KEY (สมัครรอ 1-2 วัน) · response เป็น CSV
มี cache ในหน่วยความจำ ~30 นาที (FIRMS อัปเดตทุก 3-6 ชม. อยู่แล้ว)
"""
from __future__ import annotations

import csv
import io
import time

import httpx

from ..core.config import settings
from ..core.errors import ConfigurationError

# bbox ไทย: west, south, east, north
THAILAND_BBOX = "97.3,5.5,105.7,20.5"
FIRMS_BASE = "https://firms.modaps.eosdis.nasa.gov/api/area/csv"

_CACHE: dict = {"ts": 0.0, "data": None, "key": None}
_TTL = 1800.0  # 30 นาที


def _f(v) -> float | None:
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


async def get_fires(days: int = 1) -> list[dict]:
    if not settings.firms_map_key:
        raise ConfigurationError("ยังไม่ได้ตั้งค่า FIRMS_MAP_KEY")

    cache_key = f"{days}"
    now = time.time()
    if (
        _CACHE["data"] is not None
        and _CACHE["key"] == cache_key
        and now - _CACHE["ts"] < _TTL
    ):
        return _CACHE["data"]

    url = f"{FIRMS_BASE}/{settings.firms_map_key}/VIIRS_SNPP_NRT/{THAILAND_BBOX}/{days}"
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        text = resp.text

    fires: list[dict] = []
    reader = csv.DictReader(io.StringIO(text))
    for row in reader:
        lat = _f(row.get("latitude"))
        lon = _f(row.get("longitude"))
        if lat is None or lon is None:
            continue
        fires.append(
            {
                "lat": lat,
                "lon": lon,
                "frp": _f(row.get("frp")),
                "bright": _f(row.get("bright_ti4") or row.get("brightness")),
                "daynight": row.get("daynight"),
                "acq_date": row.get("acq_date"),
            }
        )

    _CACHE.update({"ts": now, "data": fires, "key": cache_key})
    return fires
