"""air4thai (กรมควบคุมมลพิษ) — ดึง PM2.5 real-time จาก ~80 สถานีทั่วไทย

ฟรี ไม่ต้อง API key · อัปเดตทุก 1 ชั่วโมง · endpoint เป็น HTTP (เรียกฝั่ง server เท่านั้น)
"""
from __future__ import annotations

import httpx

from ..core.aqi import classify_pm25
from ..core.cache import TTLCache
from ..core.config import settings

# air4thai อัปเดตทุก ~1 ชม. → cache 5 นาทีก็ลดการยิงซ้ำได้มากโดยข้อมูลยังสด
_cache = TTLCache(ttl_seconds=300)
_CACHE_KEY = "stations"


def _to_float(v) -> float | None:
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _to_int(v) -> int | None:
    f = _to_float(v)
    return int(f) if f is not None else None


def _recorded_at(aqi_last: dict) -> str | None:
    """ประกอบ ISO timestamp (เวลาไทย +07:00) จาก field date/time ของ air4thai"""
    d = aqi_last.get("date")
    t = aqi_last.get("time")
    if not d:
        return None
    t = t or "00:00"
    if len(t) == 5:  # HH:MM
        t = f"{t}:00"
    return f"{d}T{t}+07:00"


async def fetch_stations() -> list[dict]:
    """คืน list ของสถานี (พร้อมค่า PM2.5 ล่าสุด + สี/ระดับ) — cache 5 นาที"""
    cached = _cache.get(_CACHE_KEY)
    if cached is not None:
        return cached

    async with httpx.AsyncClient(timeout=25.0, follow_redirects=True) as client:
        resp = await client.get(
            settings.air4thai_url,
            headers={"User-Agent": "ClearPath/1.0 (final-year-project)"},
        )
        resp.raise_for_status()
        data = resp.json()

    out: list[dict] = []
    for s in data.get("stations", []):
        lat = _to_float(s.get("lat"))
        lon = _to_float(s.get("long"))
        if lat is None or lon is None:
            continue

        aqi_last = s.get("AQILast") or {}
        pm_block = aqi_last.get("PM25") or {}
        pm25 = _to_float(pm_block.get("value"))
        aqi = _to_int(pm_block.get("aqi"))
        cls = classify_pm25(pm25)

        out.append(
            {
                "id": s.get("stationID"),
                "name_th": s.get("nameTH"),
                "name_en": s.get("nameEN"),
                "lat": lat,
                "lon": lon,
                "province": s.get("areaTH"),
                "pm25": pm25,
                "aqi": aqi,
                "color": cls["color"],
                "level": cls["level"],
                "recorded_at": _recorded_at(aqi_last),
            }
        )
    _cache.set(_CACHE_KEY, out)
    return out
