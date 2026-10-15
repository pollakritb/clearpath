"""Opt-in, isolated CAMS field-test snapshots; no public forecast side effects."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from starlette.concurrency import run_in_threadpool

from ..algorithms.cams_accuracy import aggregate
from ..algorithms.external_forecast import select_hourly_rows
from ..algorithms.forecast_validation import (
    collection_slot,
    forecast_rows_status,
    select_cohort,
    validation_pairs,
)
from ..core.config import settings
from ..core.errors import UpstreamError
from . import openmeteo_air, supabase_client


def validated_station_summary(station_id: str) -> dict:
    """Expose only sufficiently sampled, verified evidence; never raw rows."""

    unavailable = {
        "available": False,
        "reason": "not_evaluated",
        "station_id": station_id,
    }
    cutoff = (datetime.now(UTC) - timedelta(days=30)).isoformat()
    try:
        client = supabase_client.get_client()
        snapshots = (
            client.table("forecast_validation_snapshots")
            .select("*")
            .eq("station_id", station_id)
            .gte("valid_at", cutoff)
            .limit(5000)
            .execute()
            .data
            or []
        )
        observations = (
            client.table("forecast_validation_hourly_observations")
            .select("*")
            .eq("station_id", station_id)
            .gte("valid_at", cutoff)
            .limit(1000)
            .execute()
            .data
            or []
        )
    except Exception:
        return {**unavailable, "reason": "validation_storage_unavailable"}
    pairs = validation_pairs(snapshots, observations)
    if not pairs:
        return unavailable
    valid_hours = sorted({row["valid_at"] for row in pairs})
    span_days = (
        datetime.fromisoformat(valid_hours[-1]) - datetime.fromisoformat(valid_hours[0])
    ).total_seconds() / 86400
    if len(valid_hours) < 100 or span_days < 14:
        return {**unavailable, "reason": "insufficient_verified_samples"}
    metrics = aggregate([{**row, "prediction": row["forecast_pm25"]} for row in pairs])
    return {
        "available": True,
        "reason": "verified_one_hour_observations",
        "station_id": station_id,
        "sample_count": metrics["count"],
        "distinct_station_hours": metrics["distinct_station_hours"],
        "from_valid_at": valid_hours[0],
        "through_valid_at": valid_hours[-1],
        "mae": metrics["mae"],
        "signed_bias": metrics["bias"],
        "observation_definition": "CAMS point at valid_at versus verified official 1h mean ending at valid_at",
    }


async def collect_snapshots() -> dict:
    now = datetime.now(UTC)
    slot = collection_slot(now)
    station_catalog = await run_in_threadpool(supabase_client.get_stations)
    cohort_ids = settings.validation_cohort_ids
    if settings.app_environment.lower() == "staging":
        if (
            len(cohort_ids) != 10
            or len(set(cohort_ids)) != 10
            or "103t" not in cohort_ids
        ):
            return {
                "status": "cohort_not_configured",
                "reason": "require_reviewed_10_station_ids_including_103t",
                "snapshot_count": 0,
            }
        by_id = {str(row["id"]): row for row in station_catalog}
        if any(station_id not in by_id for station_id in cohort_ids):
            return {"status": "cohort_station_missing", "snapshot_count": 0}
        stations = [by_id[station_id] for station_id in cohort_ids]
    else:
        stations = select_cohort(station_catalog)
    if not stations:
        return {"status": "no_stations", "snapshot_count": 0}
    locations = [
        {"id": str(row["id"]), "lat": row["lat"], "lon": row["lon"]} for row in stations
    ]
    try:
        forecasts = await openmeteo_air.get_forecasts(locations, forecast_hours=28)
    except UpstreamError:
        await run_in_threadpool(
            supabase_client.upsert_forecast_validation_collection_run,
            {
                "collection_slot": slot.isoformat(),
                "attempted_at": now.isoformat(),
                "station_count": len(locations),
                "complete_station_count": 0,
                "snapshot_count": 0,
                "missing_by_station": {
                    row["id"]: "provider_unavailable" for row in locations
                },
                "status": "unavailable",
            },
        )
        return {
            "status": "unavailable",
            "station_count": len(locations),
            "snapshot_count": 0,
        }
    snapshots = []
    missing_by_station = {}
    station_issues = {}
    complete_count = 0
    for station in locations:
        source_station = next(
            (row for row in stations if str(row["id"]) == station["id"]), None
        )
        recorded_at = source_station.get("recorded_at") if source_station else None
        try:
            recorded = datetime.fromisoformat(str(recorded_at).replace("Z", "+00:00"))
            if (
                recorded.tzinfo is None
                or (now - recorded.astimezone(UTC)).total_seconds() > 5400
            ):
                station_issues[station["id"]] = "official_reading_delayed_over_90min"
        except (TypeError, ValueError):
            station_issues[station["id"]] = "official_reading_timestamp_missing"
        provider_rows = forecasts.get(station["id"], [])
        fetched_at = (
            datetime.fromisoformat(
                str(provider_rows[0]["fetched_at"]).replace("Z", "+00:00")
            )
            if provider_rows
            else now
        )
        rows = select_hourly_rows(provider_rows, 24, now=max(now, fetched_at))
        reason = forecast_rows_status(rows, 24, provider_rows)
        if reason:
            missing_by_station[station["id"]] = reason
        else:
            complete_count += 1
        for row in rows:
            snapshots.append(
                {
                    "station_id": station["id"],
                    "collection_slot": slot.isoformat(),
                    "fetched_at": row["fetched_at"],
                    "valid_at": row["forecast_at"],
                    "pm25": row["pm25"],
                    "requested_lat": station["lat"],
                    "requested_lon": station["lon"],
                    "grid_lat": row.get("source_lat"),
                    "grid_lon": row.get("source_lon"),
                    "provider": "openmeteo_cams_global",
                    "observation_period_minutes": None,
                }
            )
    written = await run_in_threadpool(
        supabase_client.upsert_forecast_validation_snapshots, snapshots
    )
    await run_in_threadpool(
        supabase_client.upsert_forecast_validation_collection_run,
        {
            "collection_slot": slot.isoformat(),
            "attempted_at": now.isoformat(),
            "station_count": len(locations),
            "complete_station_count": complete_count,
            "snapshot_count": written,
            "missing_by_station": missing_by_station,
            "station_issues": station_issues,
            "status": "complete" if not missing_by_station else "partial",
        },
    )
    cutoff = (now - timedelta(days=90)).isoformat()
    await run_in_threadpool(supabase_client.prune_forecast_validation_snapshots, cutoff)
    return {
        "status": "collected" if not missing_by_station else "partial",
        "station_count": len(stations),
        "snapshot_count": written,
        "collection_slot": slot.isoformat(),
        "observed_hourly_status": "unverified_source_not_ingested",
        "missing_by_station": missing_by_station,
        "station_issues": station_issues,
    }
