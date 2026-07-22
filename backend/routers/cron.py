"""GET /api/cron/sync — Vercel Cron รายชั่วโมง: air4thai → Supabase

ยืนยันตัวตนด้วย Authorization: Bearer <CRON_SECRET> (Vercel ส่งให้อัตโนมัติถ้าตั้ง env)
"""

from datetime import UTC, datetime
from uuid import uuid4

from fastapi import APIRouter, Header, HTTPException
from starlette.concurrency import run_in_threadpool

from ..core.config import settings
from ..core.errors import ConfigurationError
from ..services import (
    air4thai,
    forecast_data,
    notifications,
    retention,
    supabase_client,
)
from ..services import alerts as alert_service

router = APIRouter()


def _verify_cron(authorization: str | None) -> None:
    if not settings.local_demo_mode and not settings.cron_secret:
        raise ConfigurationError("production ต้องตั้งค่า CRON_SECRET")
    if settings.cron_secret and authorization != f"Bearer {settings.cron_secret}":
        raise HTTPException(401, detail="unauthorized")


@router.get("/cron/sync")
async def cron_sync(authorization: str | None = Header(default=None)):
    _verify_cron(authorization)
    run_id = str(uuid4())
    started_at = datetime.now(UTC).isoformat()
    await run_in_threadpool(
        supabase_client.create_sync_run,
        {
            "id": run_id,
            "source": "air4thai",
            "status": "running",
            "started_at": started_at,
        },
    )
    try:
        stations = await air4thai.fetch_stations()
        upserted = await run_in_threadpool(supabase_client.upsert_stations, stations)
        inserted = await run_in_threadpool(supabase_client.insert_readings, stations)
        forecast_inputs = await forecast_data.collect_forecast_inputs(stations)
        retention_result = await run_in_threadpool(retention.cleanup_expired_reports)
        source_times = [
            str(row["recorded_at"]) for row in stations if row.get("recorded_at")
        ]
        completed_at = datetime.now(UTC).isoformat()
        await run_in_threadpool(
            supabase_client.update_sync_run,
            run_id,
            {
                "status": "success",
                "fetched_count": len(stations),
                "station_count": upserted,
                "reading_count": inserted,
                "source_recorded_at": max(source_times) if source_times else None,
                "completed_at": completed_at,
            },
        )
        return {
            "ok": True,
            "run_id": run_id,
            "fetched": len(stations),
            "stations": upserted,
            "readings": inserted,
            "forecast_inputs": forecast_inputs,
            "retention": retention_result,
        }
    except Exception as exc:
        await run_in_threadpool(
            supabase_client.update_sync_run,
            run_id,
            {
                "status": "failed",
                "error_message": str(exc)[:500],
                "completed_at": datetime.now(UTC).isoformat(),
            },
        )
        raise


@router.get("/cron/alerts")
async def cron_alerts(authorization: str | None = Header(default=None)):
    _verify_cron(authorization)
    alerts = await alert_service.run_alerts()
    outbox = await run_in_threadpool(notifications.process_outbox)
    return {"alerts": alerts, "notification_outbox": outbox}
