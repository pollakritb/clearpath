"""Protected scheduled jobs, including the Air4Thai-to-Supabase sync.

GitHub Actions and Supabase Cron use independent server-only bearer tokens.
"""

import hmac
import logging
from datetime import UTC, datetime, timedelta
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, Header, HTTPException, Query
from starlette.concurrency import run_in_threadpool

from ..core.config import settings
from ..core.errors import ConfigurationError
from ..services import (
    air4thai,
    forecast_data,
    forecast_evaluation,
    forecast_reconciliation,
    forecast_status,
    forecast_validation,
    notifications,
    provider_sync,
    retention,
    supabase_client,
)
from ..services import alerts as alert_service

router = APIRouter()
logger = logging.getLogger("clearpath.forecast-monitoring")


SchedulerSource = Literal["local", "github_backup", "supabase_primary"]


def _verify_cron(authorization: str | None) -> SchedulerSource:
    configured_tokens = tuple(
        token
        for token in (settings.cron_secret, settings.supabase_cron_secret)
        if token
    )
    if not settings.local_demo_mode and not configured_tokens:
        raise ConfigurationError(
            "production must configure CRON_SECRET or SUPABASE_CRON_SECRET"
        )
    if not configured_tokens:
        return "local"

    supplied = (
        authorization.removeprefix("Bearer ").strip()
        if authorization and authorization.startswith("Bearer ")
        else ""
    )
    if (
        supplied
        and settings.supabase_cron_secret
        and hmac.compare_digest(supplied, settings.supabase_cron_secret)
    ):
        return "supabase_primary"
    if (
        supplied
        and settings.cron_secret
        and hmac.compare_digest(supplied, settings.cron_secret)
    ):
        return "github_backup"
    raise HTTPException(401, detail="unauthorized")


@router.get("/cron/sync")
async def cron_sync(authorization: str | None = Header(default=None)):
    scheduler = _verify_cron(authorization)
    if scheduler == "github_backup":
        try:
            latest_primary = await run_in_threadpool(
                supabase_client.latest_primary_sync_run
            )
            completed_at = (
                latest_primary.get("completed_at") if latest_primary else None
            )
            if completed_at:
                primary_time = datetime.fromisoformat(
                    str(completed_at).replace("Z", "+00:00")
                )
                if primary_time.tzinfo is None:
                    primary_time = primary_time.replace(tzinfo=UTC)
                age = datetime.now(UTC) - primary_time.astimezone(UTC)
                if timedelta(0) <= age < timedelta(minutes=30):
                    return {
                        "ok": True,
                        "skipped": True,
                        "reason": "recent_primary_sync",
                        "last_primary_completed_at": completed_at,
                    }
        except (ValueError, TypeError):
            logger.warning("invalid_primary_sync_timestamp")
        except Exception:
            # A failed status lookup must never disable the independent backup.
            logger.exception("primary_sync_status_unavailable")

    run_id = str(uuid4())
    started_at = datetime.now(UTC).isoformat()
    await run_in_threadpool(
        supabase_client.create_sync_run,
        {
            "id": run_id,
            "source": f"air4thai_{scheduler}",
            "status": "running",
            "started_at": started_at,
        },
    )
    try:
        stations = await air4thai.fetch_stations()
        ingestion = air4thai.get_last_ingestion_diagnostics()
        upserted = await run_in_threadpool(supabase_client.upsert_stations, stations)
        inserted = await run_in_threadpool(supabase_client.insert_readings, stations)
        if settings.forecast_system_paused:
            forecast_inputs = forecast_status.paused_job("forecast-inputs")
            reconciliation = forecast_status.paused_job("forecast-reconciliation")
        else:
            forecast_inputs = await forecast_data.collect_forecast_inputs(stations)
            reconciliation = await run_in_threadpool(
                forecast_reconciliation.reconcile_day
            )
        if reconciliation.get("alert_codes"):
            logger.warning(
                "forecast_ingestion_alert",
                extra={
                    "source": "forecast-reconciliation",
                    "alert_codes": reconciliation["alert_codes"],
                },
            )
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
                "rejected_count": ingestion["rejected_count"],
                "rejection_summary": {
                    "counts": ingestion["rejection_counts"],
                    "station_ids": ingestion["rejected_station_ids"],
                },
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
            "rejected": ingestion["rejected_count"],
            "forecast_inputs": forecast_inputs,
            "reconciliation": reconciliation,
            "retention": retention_result,
        }
    except Exception as exc:
        logger.exception(
            "forecast_ingestion_failed",
            extra={"source": "air4thai-sync"},
        )
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


@router.get("/cron/forecast-evaluation")
async def cron_forecast_evaluation(authorization: str | None = Header(default=None)):
    _verify_cron(authorization)
    if settings.forecast_system_paused:
        return forecast_status.paused_job("forecast-evaluation")
    result = await run_in_threadpool(forecast_evaluation.run_evaluation)
    alert_codes = result.get("alerts", {}).get("alert_codes", [])
    if alert_codes:
        logger.warning(
            "forecast_monitoring_alert",
            extra={"source": "forecast-evaluation", "alert_codes": alert_codes},
        )
    return result


@router.get("/cron/forecast-validation")
async def cron_forecast_validation(authorization: str | None = Header(default=None)):
    _verify_cron(authorization)
    if settings.is_production or not settings.forecast_validation_enabled:
        return {"status": "disabled", "reason": "forecast_validation_not_enabled"}
    return await forecast_validation.collect_snapshots()


@router.get("/cron/cams-snapshots")
async def cron_cams_snapshots(
    authorization: str | None = Header(default=None),
    batch_index: int | None = Query(default=None, ge=0, lt=6),
):
    _verify_cron(authorization)
    if not settings.cams_snapshot_collection_enabled:
        return {"status": "disabled", "reason": "cams_snapshot_collection_not_enabled"}
    expected_ref = settings.cams_snapshot_expected_supabase_ref.strip()
    if not expected_ref:
        return {"status": "disabled", "reason": "supabase_project_ref_not_configured"}
    if settings.supabase_url.rstrip("/") != f"https://{expected_ref}.supabase.co":
        return {"status": "disabled", "reason": "supabase_project_ref_mismatch"}
    return await provider_sync.collect_openmeteo_snapshots(batch_index=batch_index)


@router.get("/cron/forecast-providers/openmeteo")
async def cron_openmeteo_air(
    authorization: str | None = Header(default=None), only_if_due: bool = False
):
    _verify_cron(authorization)
    if settings.forecast_system_paused:
        return forecast_status.paused_job("openmeteo_cams")
    return await (
        provider_sync.sync_openmeteo_if_due()
        if only_if_due
        else provider_sync.sync_openmeteo()
    )


@router.get("/cron/forecast-providers/gistda")
async def cron_gistda_air(
    authorization: str | None = Header(default=None), only_if_due: bool = False
):
    _verify_cron(authorization)
    if settings.forecast_system_paused:
        return forecast_status.paused_job("gistda")
    if not settings.gistda_air_enabled or not settings.gistda_license_approved:
        return {
            "ok": True,
            "provider": "gistda",
            "status": "disabled",
            "reason": "licence_or_feature_gate_disabled",
        }
    return await (
        provider_sync.sync_gistda_if_due()
        if only_if_due
        else provider_sync.sync_gistda()
    )
