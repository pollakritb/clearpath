"""ดึงสถานี PM2.5 ปัจจุบัน — Supabase ก่อน, ถ้าไม่มี/ว่าง → ดึงสดจาก air4thai

ช่วยให้แอป "ดูได้ทันที" โดยไม่ต้องตั้งค่า Supabase (air4thai ฟรี ไม่ต้องใช้ key)
พอ deploy + ตั้ง Supabase + cron แล้ว จะสลับมาอ่านจาก Supabase อัตโนมัติ (เร็ว + มี history)
"""
from __future__ import annotations

from starlette.concurrency import run_in_threadpool

from ..core.config import settings
from . import air4thai, supabase_client


async def get_current_stations() -> tuple[list[dict], str]:
    """คืน (stations, source) — source = 'supabase' หรือ 'air4thai-live'"""
    if settings.has_supabase:
        try:
            rows = await run_in_threadpool(supabase_client.get_stations)
            if rows:
                return rows, "supabase"
        except Exception:
            pass  # Supabase ล่ม/ยังไม่ได้ตั้ง → ใช้ live แทน
    live = await air4thai.fetch_stations()
    return live, "air4thai-live"
