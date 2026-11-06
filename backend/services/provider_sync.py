"""Raw CAMS snapshot collection; independent of Air4Thai and grid collection."""

from __future__ import annotations

import logging
import math
from contextlib import suppress
from datetime import UTC, datetime, timedelta

from ..algorithms.distance import haversine_km
from ..algorithms.external_forecast import (
    MAX_CAMS_FORECAST_HOURS,
    provider_sync_due,
    select_hourly_rows,
)
from ..core.config import settings
from . import openmeteo_air, supabase_client
from .record_keys import creation_key

logger = logging.getLogger(__name__)

CAMS_SNAPSHOT_INTERVAL_HOURS = 6
CAMS_SNAPSHOT_BATCH_COUNT = 6
CAMS_RETENTION_BATCH_SIZE = 1000
CAMS_RETENTION_MAX_BATCHES = 6


def _cleanup_cams_history() -> dict:
    """Bound CAMS-only storage growth without touching other forecast providers."""

    now = datetime.now(UTC)
    snapshot_cutoff = (
        now - timedelta(days=max(2, settings.forecast_provider_snapshot_retention_days))
    ).isoformat()
    run_cutoff = (
        now - timedelta(days=max(7, settings.forecast_provider_run_retention_days))
    ).isoformat()
    deleted_snapshots = 0
    deleted_runs = 0
    for _ in range(CAMS_RETENTION_MAX_BATCHES):
        snapshots, runs = supabase_client.delete_cams_history_before(
            snapshot_cutoff, run_cutoff, batch_size=CAMS_RETENTION_BATCH_SIZE
        )
        deleted_snapshots += snapshots
        deleted_runs += runs
        if snapshots < CAMS_RETENTION_BATCH_SIZE and runs < CAMS_RETENTION_BATCH_SIZE:
            break
    return {"deleted_snapshots": deleted_snapshots, "deleted_runs": deleted_runs}


def _safe_cleanup_cams_history() -> dict:
    try:
        return _cleanup_cams_history()
    except Exception:
        logger.exception("cams_snapshot_retention_failed")
        return {"status": "failed"}


def _valid_stations() -> list[dict]:
    rows = []
    for station in supabase_client.get_stations():
        try:
            station_id = str(station["id"])
            lat = float(station["lat"])
            lon = float(station["lon"])
        except (KeyError, TypeError, ValueError):
            continue
        if station_id and -90 <= lat <= 90 and -180 <= lon <= 180:
            rows.append({**station, "id": station_id, "lat": lat, "lon": lon})
    return rows


def _snapshots(
    *,
    provider: str,
    run_id: str,
    issued_at: datetime,
    station_id: str,
    station_lat: float,
    station_lon: float,
    rows: list[dict],
) -> list[dict]:
    result = []
    maximum_horizon = MAX_CAMS_FORECAST_HOURS
    for row in rows:
        try:
            forecast_at = datetime.fromisoformat(
                str(row["forecast_at"]).replace("Z", "+00:00")
            )
            pm25 = float(row["pm25"])
        except (KeyError, TypeError, ValueError):
            continue
        if forecast_at.tzinfo is None:
            forecast_at = forecast_at.replace(tzinfo=UTC)
        horizon = max(0, round((forecast_at - issued_at).total_seconds() / 3600))
        if not math.isfinite(pm25) or not 0 <= pm25 <= 2000:
            continue
        if horizon > maximum_horizon:
            continue
        source_distance_km = None
        with suppress(KeyError, TypeError, ValueError):
            source_distance_km = haversine_km(
                station_lat,
                station_lon,
                float(row["source_lat"]),
                float(row["source_lon"]),
            )
        if source_distance_km is not None and source_distance_km > 100:
            continue
        result.append(
            {
                "sync_run_id": run_id,
                "station_id": station_id,
                "provider": provider,
                "issued_at": issued_at.isoformat(),
                "forecast_at": forecast_at.isoformat(),
                "horizon_hours": horizon,
                "pm25": pm25,
                "unit": "µg/m³",
                "raw_metadata": {
                    "issued_time_kind": "retrieved_at",
                    "requested_lat": station_lat,
                    "requested_lon": station_lon,
                    "grid_lat": row.get("source_lat"),
                    "grid_lon": row.get("source_lon"),
                    "fetched_at": row.get("fetched_at"),
                    "source_distance_km": (
                        round(source_distance_km, 3)
                        if source_distance_km is not None
                        else None
                    ),
                },
            }
        )
    return result


async def collect_openmeteo_snapshots(batch_index: int | None = None) -> dict:
    """Store raw CAMS station forecasts only; never create local predictions."""

    if batch_index is not None and not 0 <= batch_index < CAMS_SNAPSHOT_BATCH_COUNT:
        raise ValueError("invalid_cams_batch_index")
    latest = (
        supabase_client.get_latest_provider_sync_run("openmeteo_cams")
        if batch_index is None
        else supabase_client.get_latest_provider_sync_run(
            "openmeteo_cams", batch_index=batch_index
        )
    )
    interval = CAMS_SNAPSHOT_INTERVAL_HOURS
    previous_horizon = int(
        ((latest or {}).get("metadata") or {}).get("horizon_hours")
        or MAX_CAMS_FORECAST_HOURS
    )
    horizon_upgrade_due = previous_horizon < MAX_CAMS_FORECAST_HOURS
    if latest and not horizon_upgrade_due and not provider_sync_due(latest, interval):
        return {
            "status": "not_due",
            "interval_hours": interval,
            "latest_completed_at": latest.get("completed_at"),
            "retention": _safe_cleanup_cams_history()
            if batch_index is not None
            else None,
        }
    if latest and latest.get("status") == "running":
        try:
            started = datetime.fromisoformat(
                str(latest["started_at"]).replace("Z", "+00:00")
            )
            if started.tzinfo is None:
                started = started.replace(tzinfo=UTC)
            if (datetime.now(UTC) - started).total_seconds() < 20 * 60:
                return {"status": "in_progress", "snapshot_count": 0}
        except (KeyError, TypeError, ValueError):
            pass
    stations = _valid_stations()
    if batch_index is not None:
        stations = sorted(stations, key=lambda row: row["id"])[
            batch_index::CAMS_SNAPSHOT_BATCH_COUNT
        ]
    if not stations:
        return {"status": "no_stations", "snapshot_count": 0}

    run_id = creation_key("forecast_provider_sync_runs")
    retrieved_at = datetime.now(UTC).replace(microsecond=0)
    persisted_run = supabase_client.create_provider_sync_run(
        {
            "id": run_id,
            "provider": "openmeteo_cams",
            "status": "running",
            "station_count": len(stations),
            "started_at": retrieved_at.isoformat(),
            "metadata": {
                "mode": "raw_cams_storage_only",
                "horizon_hours": MAX_CAMS_FORECAST_HOURS,
                "batch_index": batch_index,
                "batch_count": CAMS_SNAPSHOT_BATCH_COUNT
                if batch_index is not None
                else 1,
            },
        }
    )
    run_id = str(persisted_run["id"])
    try:
        forecasts = await openmeteo_air.get_forecasts(
            stations, forecast_hours=MAX_CAMS_FORECAST_HOURS
        )
        snapshots = []
        incomplete_station_ids = []
        for station in stations:
            rows = forecasts.get(station["id"], [])
            fetched_reference = retrieved_at
            if rows:
                try:
                    fetched_reference = datetime.fromisoformat(
                        str(rows[0]["fetched_at"]).replace("Z", "+00:00")
                    )
                    if fetched_reference.tzinfo is None:
                        fetched_reference = fetched_reference.replace(tzinfo=UTC)
                    fetched_reference = max(retrieved_at, fetched_reference)
                except (KeyError, TypeError, ValueError):
                    pass
            selected = select_hourly_rows(
                rows, MAX_CAMS_FORECAST_HOURS, now=fetched_reference
            )
            normalized = _snapshots(
                provider="openmeteo_cams",
                run_id=run_id,
                issued_at=retrieved_at,
                station_id=station["id"],
                station_lat=float(station["lat"]),
                station_lon=float(station["lon"]),
                rows=selected,
            )
            future_times = []
            for row in rows:
                try:
                    forecast_at = datetime.fromisoformat(
                        str(row["forecast_at"]).replace("Z", "+00:00")
                    )
                except (KeyError, TypeError, ValueError):
                    continue
                if forecast_at.tzinfo is None:
                    forecast_at = forecast_at.replace(tzinfo=UTC)
                if forecast_at > fetched_reference:
                    future_times.append(forecast_at)
            reached_provider_end = bool(selected) and (
                len(selected) == MAX_CAMS_FORECAST_HOURS
                or datetime.fromisoformat(selected[-1]["forecast_at"])
                == max(future_times, default=fetched_reference)
            )
            if len(normalized) != len(selected) or not reached_provider_end:
                incomplete_station_ids.append(station["id"])
            snapshots.extend(normalized)
        count = sum(
            supabase_client.upsert_provider_snapshots(snapshots[offset : offset + 500])
            for offset in range(0, len(snapshots), 500)
        )
        missing = len(incomplete_station_ids)
        status = (
            "success" if count and not missing else "partial" if count else "failed"
        )
        supabase_client.update_provider_sync_run(
            run_id,
            {
                "status": status,
                "snapshot_count": count,
                "error_count": missing,
                "metadata": {
                    "mode": "raw_cams_storage_only",
                    "horizon_hours": MAX_CAMS_FORECAST_HOURS,
                    "batch_index": batch_index,
                    "batch_count": CAMS_SNAPSHOT_BATCH_COUNT
                    if batch_index is not None
                    else 1,
                    "incomplete_station_ids": incomplete_station_ids,
                },
                "completed_at": datetime.now(UTC).isoformat(),
            },
        )
        retention = _safe_cleanup_cams_history()
        return {
            "status": status,
            "station_count": len(stations),
            "snapshot_count": count,
            "missing_station_count": missing,
            "run_id": run_id,
            "batch_index": batch_index,
            "retention": retention,
        }
    except Exception:
        supabase_client.update_provider_sync_run(
            run_id,
            {"status": "failed", "completed_at": datetime.now(UTC).isoformat()},
        )
        raise
