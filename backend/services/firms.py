"""NASA FIRMS — จุดความร้อน/ไฟไหม้ป่า (VIIRS NRT) ในกรอบประเทศไทย

ฟรี · ต้องมี MAP_KEY (สมัครรอ 1-2 วัน) · response เป็น CSV
มี cache ในหน่วยความจำ ~30 นาที (FIRMS อัปเดตทุก 3-6 ชม. อยู่แล้ว)
"""

from __future__ import annotations

import csv
import io
import time
from datetime import UTC, datetime

import httpx

from ..core.config import settings
from ..core.errors import ConfigurationError, UpstreamError

# bbox ไทย: west, south, east, north
THAILAND_BBOX = "97.3,5.5,105.7,20.5"
FIRMS_BASE = "https://firms.modaps.eosdis.nasa.gov/api/area/csv"

_CACHE: dict = {"ts": 0.0, "data": None, "key": None}
_TTL = 1800.0  # 30 นาที
SOURCES = ("VIIRS_SNPP_NRT", "VIIRS_NOAA20_NRT", "VIIRS_NOAA21_NRT")


def _f(v) -> float | None:
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _acquired_at(row: dict) -> str | None:
    date = str(row.get("acq_date") or "")
    clock = str(row.get("acq_time") or "").zfill(4)
    try:
        return (
            datetime.strptime(date + clock, "%Y-%m-%d%H%M")
            .replace(tzinfo=UTC)
            .isoformat()
        )
    except ValueError:
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

    fires: list[dict] = []
    successful_sources = 0
    async with httpx.AsyncClient(timeout=30.0) as client:
        for source in SOURCES:
            url = (
                f"{FIRMS_BASE}/{settings.firms_map_key}/{source}/{THAILAND_BBOX}/{days}"
            )
            try:
                resp = await client.get(url)
                resp.raise_for_status()
            except httpx.HTTPError:
                # NASA products do not always become available at the same
                # time. Keep healthy products instead of dropping the layer.
                continue
            successful_sources += 1
            reader = csv.DictReader(io.StringIO(resp.text))
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
                        "acquired_at": _acquired_at(row),
                        "confidence": row.get("confidence"),
                        "satellite": source,
                    }
                )

    if successful_sources == 0:
        raise UpstreamError("NASA FIRMS ไม่ตอบกลับจากชุดข้อมูลดาวเทียมที่รองรับ")

    # The same thermal anomaly can appear in overlapping products. Keep one
    # point per ~100 m/time and prefer the observation with the largest FRP.
    deduplicated: dict[tuple[float, float, str | None], dict] = {}
    for fire in fires:
        key = (
            round(float(fire["lat"]), 3),
            round(float(fire["lon"]), 3),
            fire["acquired_at"],
        )
        current = deduplicated.get(key)
        if current is None or float(fire.get("frp") or 0) > float(
            current.get("frp") or 0
        ):
            deduplicated[key] = fire
    fires = list(deduplicated.values())

    _CACHE.update({"ts": now, "data": fires, "key": cache_key})
    return fires
