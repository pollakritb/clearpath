"""GET /api/cron/sync — Vercel Cron รายชั่วโมง: air4thai → Supabase

ยืนยันตัวตนด้วย Authorization: Bearer <CRON_SECRET> (Vercel ส่งให้อัตโนมัติถ้าตั้ง env)
"""
from fastapi import APIRouter, Header, HTTPException
from starlette.concurrency import run_in_threadpool

from ..core.config import settings
from ..services import air4thai, supabase_client

router = APIRouter()


@router.get("/cron/sync")
async def cron_sync(authorization: str | None = Header(default=None)):
    if settings.cron_secret and authorization != f"Bearer {settings.cron_secret}":
        raise HTTPException(401, detail="unauthorized")

    stations = await air4thai.fetch_stations()
    upserted = await run_in_threadpool(supabase_client.upsert_stations, stations)
    inserted = await run_in_threadpool(supabase_client.insert_readings, stations)
    return {
        "ok": True,
        "fetched": len(stations),
        "stations": upserted,
        "readings": inserted,
    }
