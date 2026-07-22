"""ดึงสถานี PM2.5 ปัจจุบันจาก Supabase ซึ่ง sync จาก Air4Thai รายชั่วโมง.

Air4Thai ถูกเรียกเฉพาะ cron เพื่อให้ Supabase เป็น source of truth และทุกฟีเจอร์
(แผนที่, history, forecast, trust comparison) เห็น snapshot ชุดเดียวกัน.
"""

from __future__ import annotations

from starlette.concurrency import run_in_threadpool

from ..core.errors import ConfigurationError
from . import supabase_client


async def get_current_stations() -> tuple[list[dict], str]:
    """คืน (stations, 'supabase'); ไม่มีข้อมูลให้แจ้ง 503 แทนการยิง Air4Thai สด."""
    rows = await run_in_threadpool(supabase_client.get_stations)
    if not rows:
        raise ConfigurationError(
            "Supabase ยังไม่มีข้อมูลสถานี — เรียก /api/cron/sync เพื่อ sync จาก Air4Thai"
        )
    return rows, "supabase"
