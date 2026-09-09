"""ดึงสถานี PM2.5 ปัจจุบันจาก Supabase ซึ่ง sync จาก Air4Thai รายชั่วโมง.

Air4Thai ถูกเรียกเฉพาะ cron เพื่อให้ Supabase เป็น source of truth และทุกฟีเจอร์
(แผนที่, history, forecast, trust comparison) เห็น snapshot ชุดเดียวกัน.
"""

from __future__ import annotations

from starlette.concurrency import run_in_threadpool

from ..core.aqi import classify_pm25
from ..core.errors import ConfigurationError
from . import supabase_client


def _sanitize_station(row: dict) -> dict:
    """Fail closed for missing-value sentinels already stored in Supabase."""

    normalized = dict(row)
    raw_pm25 = normalized.get("pm25")
    try:
        pm25 = float(raw_pm25) if raw_pm25 is not None else None
    except (TypeError, ValueError):
        pm25 = None
    if pm25 is not None and pm25 < 0:
        pm25 = None
    raw_aqi = normalized.get("aqi")
    try:
        aqi = int(float(raw_aqi)) if raw_aqi is not None else None
    except (TypeError, ValueError):
        aqi = None
    if aqi is not None and aqi < 0:
        aqi = None
    classification = classify_pm25(pm25)
    normalized.update(
        pm25=pm25,
        aqi=aqi,
        color=classification["color"],
        level=classification["level"],
    )
    return normalized


async def get_current_stations() -> tuple[list[dict], str]:
    """คืน (stations, 'supabase'); ไม่มีข้อมูลให้แจ้ง 503 แทนการยิง Air4Thai สด."""
    rows = await run_in_threadpool(supabase_client.get_stations)
    if not rows:
        raise ConfigurationError(
            "Supabase ยังไม่มีข้อมูลสถานี — เรียก /api/cron/sync เพื่อ sync จาก Air4Thai"
        )
    return [_sanitize_station(row) for row in rows], "supabase"
