"""Nationwide provider ingestion; Air4Thai remains isolated in its hourly cron."""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from uuid import uuid4

from . import gistda_air, openmeteo_air, openweather_air, supabase_client


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
    rows: list[dict],
) -> list[dict]:
    result = []
    for row in rows:
        forecast_at = datetime.fromisoformat(
            str(row["forecast_at"]).replace("Z", "+00:00")
        )
        if forecast_at.tzinfo is None:
            forecast_at = forecast_at.replace(tzinfo=UTC)
        horizon = max(0, round((forecast_at - issued_at).total_seconds() / 3600))
        result.append(
            {
                "sync_run_id": run_id,
                "station_id": station_id,
                "provider": provider,
                "issued_at": issued_at.isoformat(),
                "forecast_at": forecast_at.isoformat(),
                "horizon_hours": horizon,
                "pm25": max(0.0, float(row["pm25"])),
                "unit": "µg/m³",
            }
        )
    return result


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
    for station_id, rows, error in fetched:
        if error:
            errors.append({"station_id": station_id, "error": error})
        snapshots.extend(
            _snapshots(
                provider="openweather",
                run_id=run_id,
                issued_at=issued_at,
                station_id=station_id,
                rows=rows,
            )
        )
    count = supabase_client.upsert_provider_snapshots(snapshots)
    status = "success" if not errors else "partial" if count else "failed"
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
                "failed_station_ids": [row["station_id"] for row in errors[:100]]
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
    for station_id, rows, error in fetched:
        if error:
            errors.append({"station_id": station_id, "error": error})
        snapshots.extend(
            _snapshots(
                provider="gistda",
                run_id=run_id,
                issued_at=issued_at,
                station_id=station_id,
                rows=rows,
            )
        )
    count = supabase_client.upsert_provider_snapshots(snapshots)
    status = "success" if not errors else "partial" if count else "failed"
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
                rows=by_station.get(station["id"], []),
            )
        ]
        count = supabase_client.upsert_provider_snapshots(snapshots)
        status = "success" if len(by_station) == len(stations) else "partial"
        supabase_client.update_provider_sync_run(
            run_id,
            {
                "status": status,
                "snapshot_count": count,
                "error_count": max(0, len(stations) - len(by_station)),
                "completed_at": datetime.now(UTC).isoformat(),
            },
        )
        return {
            "ok": True,
            "run_id": run_id,
            "provider": "openmeteo_cams",
            "status": status,
            "stations": len(stations),
            "snapshots": count,
            "errors": max(0, len(stations) - len(by_station)),
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
