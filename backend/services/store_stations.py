"""Stations persistence; shared client and demo behavior stay centralized."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from ..core.config import settings
from ..core.errors import UpstreamError
from . import local_store
from . import store_client as db

STATION_COLS = [
    "id",
    "name_th",
    "name_en",
    "lat",
    "lon",
    "province",
    "district",
    "pm25",
    "aqi",
    "color",
    "level",
    "recorded_at",
]


def upsert_stations(stations: list[dict]) -> int:
    """upsert ค่าล่าสุดของแต่ละสถานี (ตาราง stations)"""
    if settings.local_demo_mode:
        return local_store.upsert_stations(stations)
    now = datetime.now(UTC).isoformat()
    rows = []
    for s in stations:
        if not s.get("id"):
            continue
        row = {c: s.get(c) for c in STATION_COLS}
        row["updated_at"] = now
        rows.append(row)
    if rows:
        db.get_client().table("stations").upsert(rows).execute()
    return len(rows)


def insert_readings(stations: list[dict]) -> int:
    """append ประวัติรายชั่วโมง (ตาราง pm25_readings) — ข้ามค่าซ้ำด้วย on_conflict"""
    if settings.local_demo_mode:
        return local_store.insert_readings(stations)
    rows = [
        {
            "station_id": s["id"],
            "pm25": s.get("pm25"),
            "aqi": s.get("aqi"),
            "recorded_at": s["recorded_at"],
            "source_at": s["recorded_at"],
            "source_status": "observed",
        }
        for s in stations
        if s.get("id") and s.get("recorded_at") and s.get("pm25") is not None
    ]
    if rows:
        db.get_client().table("pm25_readings").upsert(
            rows, on_conflict="station_id,recorded_at", ignore_duplicates=True
        ).execute()
    return len(rows)


def get_stations() -> list[dict]:
    if settings.local_demo_mode:
        return local_store.get_stations()
    res = db._execute_read(
        lambda: db.get_client().table("stations").select("*").execute()
    )
    return res.data or []


def get_station_by_id(station_id: str) -> dict | None:
    if settings.local_demo_mode:
        return next(
            (row for row in local_store.get_stations() if str(row["id"]) == station_id),
            None,
        )
    rows = (
        db._execute_read(
            lambda: (
                db.get_client()
                .table("stations")
                .select("*")
                .eq("id", station_id)
                .limit(1)
                .execute()
            )
        ).data
        or []
    )
    return rows[0] if rows else None


def upsert_forecast_validation_snapshots(rows: list[dict]) -> int:
    """Insert immutable evidence; a retry never overwrites an earlier forecast."""

    if not rows:
        return 0
    if settings.local_demo_mode:
        return 0
    result = (
        db.get_client()
        .table("forecast_validation_snapshots")
        .upsert(
            rows,
            on_conflict="station_id,collection_slot,valid_at",
            ignore_duplicates=True,
        )
        .execute()
    )
    return len(result.data or [])


def upsert_forecast_validation_collection_run(row: dict) -> None:
    """Keep the latest execution diagnostic for an idempotent six-hour slot."""

    if settings.local_demo_mode:
        return
    db.get_client().table("forecast_validation_collection_runs").upsert(
        row, on_conflict="collection_slot"
    ).execute()


def prune_forecast_validation_snapshots(cutoff: str) -> None:
    """Keep this experimental evidence table at or below 90 days."""

    if settings.local_demo_mode:
        return
    db.get_client().table("forecast_validation_snapshots").delete().lt(
        "collection_slot", cutoff
    ).execute()


def get_history(
    station_id: str, hours: int = 24, end_at: datetime | None = None
) -> list[dict]:
    if settings.local_demo_mode:
        return local_store.get_history(station_id, hours, end_at)
    end = end_at or datetime.now(UTC)
    cutoff = (end - timedelta(hours=hours)).isoformat()
    res = db._execute_read(
        lambda: (
            db.get_client()
            .table("pm25_readings")
            .select("recorded_at,pm25,aqi")
            .eq("station_id", station_id)
            .gte("recorded_at", cutoff)
            .lte("recorded_at", end.isoformat())
            .order("recorded_at")
            .execute()
        )
    )
    return res.data or []


def get_map_history_readings(
    target_at: datetime, max_age_minutes: int = 90
) -> list[dict]:
    if settings.local_demo_mode:
        return local_store.get_map_history_readings(target_at, max_age_minutes)
    target = target_at.astimezone(UTC)
    cutoff = target - timedelta(minutes=max_age_minutes)
    res = db._execute_read(
        lambda: (
            db.get_client()
            .table("pm25_readings")
            .select("station_id,recorded_at,pm25,aqi")
            .gte("recorded_at", cutoff.isoformat())
            .lte("recorded_at", target.isoformat())
            .order("recorded_at", desc=True)
            .limit(1000)
            .execute()
        )
    )
    return res.data or []


def create_provider_sync_run(row: dict) -> dict:
    if settings.local_demo_mode:
        return local_store.create_provider_sync_run(row)
    rows = (
        db.get_client().table("forecast_provider_sync_runs").insert(row).execute().data
        or []
    )
    if not rows:
        raise UpstreamError("forecast_provider_run_write_blocked")
    return rows[0]


def update_provider_sync_run(run_id: str, values: dict) -> dict:
    if settings.local_demo_mode:
        return local_store.update_provider_sync_run(run_id, values)
    rows = (
        db.get_client()
        .table("forecast_provider_sync_runs")
        .update(values)
        .eq("id", run_id)
        .execute()
        .data
        or []
    )
    if not rows:
        raise UpstreamError("forecast_provider_run_update_blocked")
    return rows[0]


def get_latest_provider_sync_run(
    provider: str, batch_index: int | None = None
) -> dict | None:
    if settings.local_demo_mode:
        return local_store.get_latest_provider_sync_run(provider, batch_index)

    def read():
        query = (
            db.get_client()
            .table("forecast_provider_sync_runs")
            .select("*")
            .eq("provider", provider)
        )
        if batch_index is not None:
            query = query.contains("metadata", {"batch_index": batch_index})
        return query.order("started_at", desc=True).limit(1).execute()

    rows = db._execute_read(read).data or []
    return rows[0] if rows else None


def upsert_provider_snapshots(rows: list[dict]) -> int:
    if not rows:
        return 0
    if settings.local_demo_mode:
        return local_store.upsert_provider_snapshots(rows)
    persisted = (
        db.get_client()
        .table("forecast_provider_snapshots")
        .upsert(rows, on_conflict="station_id,provider,issued_at,forecast_at")
        .execute()
        .data
        or []
    )
    if len(persisted) != len(rows):
        raise UpstreamError("forecast_provider_snapshot_write_incomplete")
    return len(persisted)


def get_recent_cams_snapshots(
    station_id: str, issued_after: str, forecast_after: str
) -> list[dict]:
    """Read bounded, future CAMS evidence for one station."""

    if settings.local_demo_mode:
        return local_store.get_recent_cams_snapshots(
            station_id, issued_after, forecast_after
        )
    return (
        db._execute_read(
            lambda: (
                db.get_client()
                .table("forecast_provider_snapshots")
                .select("sync_run_id,issued_at,forecast_at,pm25,raw_metadata")
                .eq("station_id", station_id)
                .eq("provider", "openmeteo_cams")
                .gte("issued_at", issued_after)
                .gt("forecast_at", forecast_after)
                .order("issued_at", desc=True)
                .limit(2 * 120)
                .execute()
            )
        ).data
        or []
    )


def get_provider_sync_run(run_id: str) -> dict | None:
    if settings.local_demo_mode:
        return local_store.get_provider_sync_run(run_id)
    rows = (
        db._execute_read(
            lambda: (
                db.get_client()
                .table("forecast_provider_sync_runs")
                .select("id,status,completed_at")
                .eq("id", run_id)
                .limit(1)
                .execute()
            )
        ).data
        or []
    )
    return rows[0] if rows else None


def delete_cams_history_before(
    snapshot_cutoff_at: str, run_cutoff_at: str, *, batch_size: int = 1000
) -> tuple[int, int]:
    """Remove one bounded batch of expired CAMS evidence, never other providers."""

    if settings.local_demo_mode:
        return local_store.delete_cams_history_before(
            snapshot_cutoff_at, run_cutoff_at, batch_size=batch_size
        )
    result = (
        db.get_client()
        .rpc(
            "prune_expired_cams_history",
            {
                "p_snapshot_cutoff": snapshot_cutoff_at,
                "p_run_cutoff": run_cutoff_at,
                "p_batch_size": batch_size,
            },
        )
        .execute()
        .data
    )
    if not isinstance(result, dict):
        raise UpstreamError("cams_snapshot_retention_result_invalid")
    return int(result["deleted_snapshots"]), int(result["deleted_runs"])


def forecast_provider_health() -> dict:

    if settings.local_demo_mode:
        runs = local_store.list_provider_sync_runs(20)
    else:
        runs = (
            db.get_client()
            .table("forecast_provider_sync_runs")
            .select("*")
            .order("started_at", desc=True)
            .limit(20)
            .execute()
            .data
            or []
        )
    latest = {}
    for row in runs:
        provider = str(row.get("provider") or "")
        if provider == "openmeteo_cams":
            latest.setdefault(provider, row)
    # Retain the old response shape without querying retired consensus storage.
    return {
        "providers": list(latest.values()),
        "consensus": {
            "station_count": 0,
            "multi_provider_count": 0,
            "community_influenced_count": 0,
            "agreement_counts": {"high": 0, "medium": 0, "low": 0},
        },
        "feature_flags": {
            "openmeteo_cams": settings.openmeteo_air_enabled,
            "gistda": False,
            "community_forecast_shadow": False,
        },
    }
