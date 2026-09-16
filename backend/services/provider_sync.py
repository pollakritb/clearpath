"""Nationwide provider ingestion; Air4Thai remains isolated in its hourly cron."""

from __future__ import annotations

import asyncio
import logging
import math
from collections.abc import Awaitable, Callable
from contextlib import suppress
from datetime import UTC, datetime
from uuid import uuid4

from ..algorithms.distance import haversine_km
from ..algorithms.forecast_selection import provider_circuit_open, provider_sync_due
from ..core.config import settings
from ..core.errors import UpstreamError
from . import gistda_air, openmeteo_air, openweather_air, supabase_client
from .forecast_models import SUPPORTED_HORIZONS
from .forecast_provider_registry import PROVIDERS

logger = logging.getLogger(__name__)

PROVIDER_SYNC_INTERVAL_HOURS = {
    "gistda": 3,
    "openweather": 8,
    "openmeteo_cams": 12,
}


async def _sync_if_due(
    provider: str,
    sync: Callable[[], Awaitable[dict]],
) -> dict:
    latest = supabase_client.get_latest_provider_sync_run(provider)
    interval = PROVIDER_SYNC_INTERVAL_HOURS[provider]
    if provider_circuit_open(latest):
        return {
            "ok": True,
            "provider": provider,
            "status": "circuit_open",
            "retry_after_minutes": 60,
            "cache_fallback": True,
            "latest_completed_at": latest.get("completed_at") if latest else None,
        }
    if not provider_sync_due(latest, interval):
        return {
            "ok": True,
            "provider": provider,
            "status": "not_due",
            "interval_hours": interval,
            "latest_completed_at": latest.get("completed_at") if latest else None,
        }
    result = await sync()
    if result.get("ok") is False:
        raise UpstreamError(f"{provider} forecast sync failed")
    return result


async def sync_openweather_if_due() -> dict:
    if not settings.openweather_air_enabled:
        return {"ok": True, "provider": "openweather", "status": "disabled"}
    return await _sync_if_due("openweather", sync_openweather)


async def sync_openmeteo_if_due() -> dict:
    if not settings.openmeteo_air_enabled:
        return {"ok": True, "provider": "openmeteo_cams", "status": "disabled"}
    return await _sync_if_due("openmeteo_cams", sync_openmeteo)


async def sync_gistda_if_due() -> dict:
    if not settings.gistda_air_enabled or not settings.gistda_license_approved:
        return {"ok": True, "provider": "gistda", "status": "disabled"}
    return await _sync_if_due("gistda", sync_gistda)


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
    maximum_horizon = int(PROVIDERS[provider]["maximum_horizon_hours"])
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
                    "source_distance_km": (
                        round(source_distance_km, 3)
                        if source_distance_km is not None
                        else None
                    ),
                },
            }
        )
    return result


def _persist_provider_evidence(
    *,
    provider: str,
    issued_at: datetime,
    stations: list[dict],
    snapshots: list[dict],
) -> dict:
    """Record provider forecasts independently of user forecast-page traffic."""

    station_by_id = {str(row["id"]): row for row in stations}
    snapshots_by_station: dict[str, dict[int, dict]] = {}
    for snapshot in snapshots:
        horizon = int(snapshot.get("horizon_hours") or 0)
        if horizon not in SUPPORTED_HORIZONS:
            continue
        station_id = str(snapshot.get("station_id") or "")
        # A provider should have at most one value per station/horizon. Keeping
        # the first normalized row makes retries deterministic.
        snapshots_by_station.setdefault(station_id, {}).setdefault(horizon, snapshot)

    runs: list[dict] = []
    predictions: list[dict] = []
    for station_id, horizon_rows in sorted(snapshots_by_station.items()):
        station = station_by_id.get(station_id)
        if not station or not horizon_rows:
            continue
        evidence_run_id = str(uuid4())
        runs.append(
            {
                "id": evidence_run_id,
                "station_id": station_id,
                "district": station.get("district"),
                "generated_at": issued_at.isoformat(),
                "method": f"provider:{provider}",
                "model_version": None,
                "fallback_reason": None,
                "data_quality": "sufficient",
                "source_points": len(horizon_rows),
                "environment": settings.app_environment,
                "feature_version": None,
                "artifact_sha256": None,
                "source_recorded_at": issued_at.isoformat(),
                "input_freshness_minutes": 0.0,
                "feature_quality": {
                    "source": provider,
                    "issued_time_kind": "retrieved_at",
                },
                "coverage": {"coverage_target": 0.0},
                "warnings": [],
                "latency_ms": None,
            }
        )
        baseline = station.get("pm25")
        try:
            baseline = float(baseline)
            if not math.isfinite(baseline) or baseline < 0:
                baseline = None
        except (TypeError, ValueError):
            baseline = None
        for horizon, snapshot in sorted(horizon_rows.items()):
            value = round(float(snapshot["pm25"]), 1)
            predictions.append(
                {
                    "run_id": evidence_run_id,
                    "horizon_hours": horizon,
                    "variant": "served",
                    "forecast_at": snapshot["forecast_at"],
                    "pm25": value,
                    "lower": value,
                    "upper": value,
                    "method": f"provider:{provider}",
                    "model_version": None,
                    "artifact_sha256": None,
                    "calibration_version": "provider-point-no-interval-v1",
                    "coverage_target": 0.0,
                    "baseline_pm25": baseline,
                }
            )

    if not runs:
        return {"runs": 0, "predictions": 0, "error": None}
    try:
        supabase_client.insert_forecast_ledgers(runs, predictions)
    except Exception as exc:  # evidence must never invalidate usable snapshots
        logger.exception("Provider evidence persistence failed for %s", provider)
        return {"runs": 0, "predictions": 0, "error": str(exc)[:200]}
    return {"runs": len(runs), "predictions": len(predictions), "error": None}


async def sync_openweather() -> dict:
    stations = _valid_stations()
    run_id = str(uuid4())
    issued_at = datetime.now(UTC).replace(microsecond=0)
    supabase_client.create_provider_sync_run(
        {
            "id": run_id,
            "provider": "openweather",
            "status": "running",
            "station_count": len(stations),
            "started_at": issued_at.isoformat(),
        }
    )
    semaphore = asyncio.Semaphore(8)

    async def fetch(station: dict) -> tuple[str, list[dict], str | None]:
        async with semaphore:
            try:
                rows = await openweather_air.get_forecast(
                    station["lat"], station["lon"]
                )
                return station["id"], rows, None
            except Exception as exc:
                return station["id"], [], str(exc)[:200]

    fetched = await asyncio.gather(*(fetch(station) for station in stations))
    snapshots = []
    errors = []
    station_by_id = {str(row["id"]): row for row in stations}
    for station_id, rows, error in fetched:
        if error:
            errors.append({"station_id": station_id, "error": error})
        snapshots.extend(
            _snapshots(
                provider="openweather",
                run_id=run_id,
                issued_at=issued_at,
                station_id=station_id,
                station_lat=float(station_by_id[station_id]["lat"]),
                station_lon=float(station_by_id[station_id]["lon"]),
                rows=rows,
            )
        )
    count = supabase_client.upsert_provider_snapshots(snapshots)
    evidence = _persist_provider_evidence(
        provider="openweather",
        issued_at=issued_at,
        stations=stations,
        snapshots=snapshots,
    )
    status = "success" if count and not errors else "partial" if count else "failed"
    completed_at = datetime.now(UTC).isoformat()
    supabase_client.update_provider_sync_run(
        run_id,
        {
            "status": status,
            "snapshot_count": count,
            "error_count": len(errors),
            "error_message": errors[0]["error"] if errors else None,
            "completed_at": completed_at,
            "metadata": {
                "failed_station_ids": [row["station_id"] for row in errors[:100]],
                "evidence": evidence,
            },
        },
    )
    return {
        "ok": status != "failed",
        "run_id": run_id,
        "provider": "openweather",
        "status": status,
        "stations": len(stations),
        "snapshots": count,
        "errors": len(errors),
        "evidence": evidence,
    }


async def sync_gistda() -> dict:
    """Sync GISTDA only after both feature and legal gates are enabled."""

    stations = _valid_stations()
    run_id = str(uuid4())
    issued_at = datetime.now(UTC).replace(microsecond=0)
    supabase_client.create_provider_sync_run(
        {
            "id": run_id,
            "provider": "gistda",
            "status": "running",
            "station_count": len(stations),
            "started_at": issued_at.isoformat(),
            "metadata": {"licence_gate": "approved"},
        }
    )
    semaphore = asyncio.Semaphore(4)

    async def fetch(station: dict) -> tuple[str, list[dict], str | None]:
        async with semaphore:
            try:
                rows = await gistda_air.get_forecast(station["lat"], station["lon"])
                return station["id"], rows, None
            except Exception as exc:
                return station["id"], [], str(exc)[:200]

    fetched = await asyncio.gather(*(fetch(station) for station in stations))
    snapshots = []
    errors = []
    station_by_id = {str(row["id"]): row for row in stations}
    for station_id, rows, error in fetched:
        if error:
            errors.append({"station_id": station_id, "error": error})
        snapshots.extend(
            _snapshots(
                provider="gistda",
                run_id=run_id,
                issued_at=issued_at,
                station_id=station_id,
                station_lat=float(station_by_id[station_id]["lat"]),
                station_lon=float(station_by_id[station_id]["lon"]),
                rows=rows,
            )
        )
    count = supabase_client.upsert_provider_snapshots(snapshots)
    evidence = _persist_provider_evidence(
        provider="gistda",
        issued_at=issued_at,
        stations=stations,
        snapshots=snapshots,
    )
    status = "success" if count and not errors else "partial" if count else "failed"
    supabase_client.update_provider_sync_run(
        run_id,
        {
            "status": status,
            "snapshot_count": count,
            "error_count": len(errors),
            "error_message": errors[0]["error"] if errors else None,
            "completed_at": datetime.now(UTC).isoformat(),
            "metadata": {
                "licence_gate": "approved",
                "failed_station_ids": [row["station_id"] for row in errors[:100]],
                "evidence": evidence,
            },
        },
    )
    return {
        "ok": status != "failed",
        "run_id": run_id,
        "provider": "gistda",
        "status": status,
        "stations": len(stations),
        "snapshots": count,
        "errors": len(errors),
        "evidence": evidence,
    }


async def sync_openmeteo() -> dict:
    stations = _valid_stations()
    run_id = str(uuid4())
    issued_at = datetime.now(UTC).replace(microsecond=0)
    supabase_client.create_provider_sync_run(
        {
            "id": run_id,
            "provider": "openmeteo_cams",
            "status": "running",
            "station_count": len(stations),
            "started_at": issued_at.isoformat(),
        }
    )
    try:
        by_station = await openmeteo_air.get_forecasts(stations)
        snapshots = [
            snapshot
            for station in stations
            for snapshot in _snapshots(
                provider="openmeteo_cams",
                run_id=run_id,
                issued_at=issued_at,
                station_id=station["id"],
                station_lat=float(station["lat"]),
                station_lon=float(station["lon"]),
                rows=by_station.get(station["id"], []),
            )
        ]
        count = supabase_client.upsert_provider_snapshots(snapshots)
        evidence = _persist_provider_evidence(
            provider="openmeteo_cams",
            issued_at=issued_at,
            stations=stations,
            snapshots=snapshots,
        )
        status = (
            "success"
            if count and len(by_station) == len(stations)
            else "partial"
            if count
            else "failed"
        )
        supabase_client.update_provider_sync_run(
            run_id,
            {
                "status": status,
                "snapshot_count": count,
                "error_count": max(0, len(stations) - len(by_station)),
                "completed_at": datetime.now(UTC).isoformat(),
                "metadata": {"evidence": evidence},
            },
        )
        return {
            "ok": status != "failed",
            "run_id": run_id,
            "provider": "openmeteo_cams",
            "status": status,
            "stations": len(stations),
            "snapshots": count,
            "errors": max(0, len(stations) - len(by_station)),
            "evidence": evidence,
        }
    except Exception as exc:
        supabase_client.update_provider_sync_run(
            run_id,
            {
                "status": "failed",
                "error_count": len(stations),
                "error_message": str(exc)[:500],
                "completed_at": datetime.now(UTC).isoformat(),
            },
        )
        raise
