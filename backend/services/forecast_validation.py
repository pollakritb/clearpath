"""Opt-in, isolated CAMS field-test snapshots; no public forecast side effects."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from starlette.concurrency import run_in_threadpool

from ..algorithms.external_forecast import select_hourly_rows
from ..algorithms.forecast_validation import collection_slot, select_cohort
from . import openmeteo_air, supabase_client


async def collect_snapshots() -> dict:
    now = datetime.now(UTC)
    slot = collection_slot(now)
    stations = select_cohort(await run_in_threadpool(supabase_client.get_stations))
    if not stations:
        return {"status": "no_stations", "snapshot_count": 0}
    locations = [
        {"id": str(row["id"]), "lat": row["lat"], "lon": row["lon"]} for row in stations
    ]
    forecasts = await openmeteo_air.get_forecasts(locations, forecast_hours=27)
    snapshots = []
    for station in locations:
        rows = select_hourly_rows(forecasts.get(station["id"], []), 24, now=now)
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
    cutoff = (now - timedelta(days=90)).isoformat()
    await run_in_threadpool(supabase_client.prune_forecast_validation_snapshots, cutoff)
    return {
        "status": "collected",
        "station_count": len(stations),
        "snapshot_count": written,
        "collection_slot": slot.isoformat(),
        "observed_hourly_status": "unverified_source_not_ingested",
    }
