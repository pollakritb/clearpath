"""air4thai (กรมควบคุมมลพิษ) — ดึง PM2.5 real-time จาก ~80 สถานีทั่วไทย

ฟรี ไม่ต้อง API key · อัปเดตทุก 1 ชั่วโมง · endpoint เป็น HTTP (เรียกฝั่ง server เท่านั้น)
"""

from __future__ import annotations

import logging

import httpx

from ..algorithms.district import resolve_station_district
from ..core.aqi import classify_pm25
from ..core.cache import TTLCache
from ..core.config import settings
from ..core.errors import UpstreamError

# air4thai อัปเดตทุก ~1 ชม. → cache 5 นาทีก็ลดการยิงซ้ำได้มากโดยข้อมูลยังสด
_cache = TTLCache(ttl_seconds=300)
_CACHE_KEY = "station_snapshot"
logger = logging.getLogger("clearpath.air4thai")


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
        return list(cached["stations"])

    try:
        async with httpx.AsyncClient(timeout=25.0, follow_redirects=True) as client:
            resp = await client.get(
                settings.air4thai_url,
                headers={"User-Agent": "ClearPath/1.0 (final-year-project)"},
            )
            resp.raise_for_status()
            data = resp.json()
    except (httpx.HTTPError, ValueError, TypeError) as exc:
        raise UpstreamError("Air4Thai ตอบกลับไม่สำเร็จหรือข้อมูลไม่ถูกต้อง") from exc

    out, diagnostics = parse_stations(data)
    if diagnostics["rejected_count"]:
        logger.warning("air4thai_rows_rejected", extra=diagnostics)
    _cache.set(_CACHE_KEY, {"stations": out, "diagnostics": diagnostics})
    return out


def parse_stations(data: dict) -> tuple[list[dict], dict]:
    """Normalize one payload and return explicit rejection diagnostics."""
    raw_stations = data.get("stations") or []
    out: list[dict] = []
    rejection_counts: dict[str, int] = {}
    rejected_station_ids: list[str] = []

    def reject(reason: str, station_id: object) -> None:
        rejection_counts[reason] = rejection_counts.get(reason, 0) + 1
        if len(rejected_station_ids) < 20:
            rejected_station_ids.append(str(station_id or "unknown"))

    for s in raw_stations:
        station_id = str(s.get("stationID") or "").strip()
        if not station_id:
            reject("missing_station_id", None)
            continue
        lat = _to_float(s.get("lat"))
        lon = _to_float(s.get("long"))
        if lat is None or lon is None:
            reject("invalid_coordinates", station_id)
            continue
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            reject("coordinates_out_of_range", station_id)
            continue

        aqi_last = s.get("AQILast") or {}
        pm_block = aqi_last.get("PM25") or {}
        pm25 = _to_float(pm_block.get("value"))
        aqi = _to_int(pm_block.get("aqi"))
        cls = classify_pm25(pm25)

        out.append(
            {
                "id": station_id,
                "name_th": s.get("nameTH"),
                "name_en": s.get("nameEN"),
                "lat": lat,
                "lon": lon,
                "province": s.get("areaTH"),
                "district": resolve_station_district(station_id, s.get("areaTH")),
                "pm25": pm25,
                "aqi": aqi,
                "color": cls["color"],
                "level": cls["level"],
                "recorded_at": _recorded_at(aqi_last),
            }
        )
    diagnostics = {
        "fetched_count": len(raw_stations),
        "accepted_count": len(out),
        "rejected_count": len(raw_stations) - len(out),
        "rejection_counts": rejection_counts,
        "rejected_station_ids": rejected_station_ids,
    }
    return out, diagnostics


def get_last_ingestion_diagnostics() -> dict:
    cached = _cache.get(_CACHE_KEY)
    if cached is None:
        return {
            "fetched_count": 0,
            "accepted_count": 0,
            "rejected_count": 0,
            "rejection_counts": {},
            "rejected_station_ids": [],
        }
    return dict(cached["diagnostics"])
