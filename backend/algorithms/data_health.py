"""Pure operational summary for official station data and ingestion runs."""

from __future__ import annotations

from datetime import UTC, datetime

from .freshness import station_freshness


def _timestamp(value: object) -> datetime | None:
    if isinstance(value, datetime):
        parsed = value
    else:
        try:
            parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        except (TypeError, ValueError):
            return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def summarize_data_health(
    stations: list[dict], sync_runs: list[dict], *, now: datetime | None = None
) -> dict:
    """Return explainable, non-secret metrics used by the operations console."""

    observed_at = now or datetime.now(UTC)
    freshness = [
        station_freshness(row.get("recorded_at"), now=observed_at) for row in stations
    ]
    counts = {
        status: sum(item["data_status"] == status for item in freshness)
        for status in ("fresh", "delayed", "expired")
    }
    station_count = len(stations)
    stale_count = counts["delayed"] + counts["expired"]
    stale_ratio = stale_count / station_count if station_count else 1.0

    recorded_times = [
        parsed
        for row in stations
        if (parsed := _timestamp(row.get("recorded_at"))) is not None
    ]
    latest_recorded_at = max(recorded_times).isoformat() if recorded_times else None

    ordered_runs = sorted(
        sync_runs,
        key=lambda row: (
            _timestamp(row.get("started_at")) or datetime.min.replace(tzinfo=UTC)
        ),
        reverse=True,
    )
    latest_run = ordered_runs[0] if ordered_runs else None

    def latest_for_source(source: str) -> dict | None:
        return next((row for row in ordered_runs if row.get("source") == source), None)

    latest_primary = latest_for_source("air4thai_supabase_primary")
    latest_backup = latest_for_source("air4thai_github_backup")
    primary_started_at = (
        _timestamp(latest_primary.get("started_at")) if latest_primary else None
    )
    backup_started_at = (
        _timestamp(latest_backup.get("started_at")) if latest_backup else None
    )
    primary_sync_missed = bool(
        primary_started_at is None
        or (observed_at - primary_started_at).total_seconds() > 45 * 60
    )
    started_at = _timestamp(latest_run.get("started_at")) if latest_run else None
    completed_at = _timestamp(latest_run.get("completed_at")) if latest_run else None
    duration_ms = None
    if started_at and completed_at and completed_at >= started_at:
        duration_ms = round((completed_at - started_at).total_seconds() * 1000, 1)

    consecutive_failures = 0
    for run in ordered_runs:
        if run.get("status") != "failed":
            break
        consecutive_failures += 1

    latest_status = str(latest_run.get("status")) if latest_run else None
    sync_stuck = bool(
        latest_status == "running"
        and started_at
        and (observed_at - started_at).total_seconds() > 15 * 60
    )
    upstream_failure = latest_status == "failed" or consecutive_failures > 0
    alert_codes: list[str] = []
    if not station_count:
        alert_codes.append("station_data_missing")
    elif counts["fresh"] == 0:
        alert_codes.append("station_data_stale")
    elif stale_ratio > 0.5:
        alert_codes.append("stale_ratio_high")
    if not latest_run:
        alert_codes.append("sync_history_missing")
    if primary_sync_missed:
        alert_codes.append("primary_cron_missed")
    if upstream_failure:
        alert_codes.append("upstream_sync_failed")
    if sync_stuck:
        alert_codes.append("sync_run_stuck")

    critical_codes = {"station_data_missing", "station_data_stale"}
    status = (
        "critical"
        if critical_codes.intersection(alert_codes)
        else "degraded"
        if alert_codes
        else "healthy"
    )
    return {
        "status": status,
        "observed_at": observed_at.isoformat(),
        "station_count": station_count,
        "fresh_station_count": counts["fresh"],
        "delayed_station_count": counts["delayed"],
        "expired_station_count": counts["expired"],
        "stale_station_ratio": round(stale_ratio, 4),
        "latest_recorded_at": latest_recorded_at,
        "latest_sync_status": latest_status,
        "latest_sync_started_at": started_at.isoformat() if started_at else None,
        "latest_sync_completed_at": completed_at.isoformat() if completed_at else None,
        "latest_sync_duration_ms": duration_ms,
        "latest_primary_sync_at": (
            primary_started_at.isoformat() if primary_started_at else None
        ),
        "latest_primary_sync_status": (
            str(latest_primary.get("status")) if latest_primary else None
        ),
        "latest_backup_sync_at": (
            backup_started_at.isoformat() if backup_started_at else None
        ),
        "latest_backup_sync_status": (
            str(latest_backup.get("status")) if latest_backup else None
        ),
        "primary_sync_missed": primary_sync_missed,
        "consecutive_sync_failures": consecutive_failures,
        "upstream_failure": upstream_failure,
        "alert_codes": alert_codes,
    }
