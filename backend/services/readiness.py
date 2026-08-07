"""Read-only readiness check for the production source of truth."""

from __future__ import annotations

from datetime import UTC, datetime

from ..algorithms.freshness import station_freshness
from ..core.config import settings
from . import supabase_client


def check_readiness() -> dict:
    """Return a safe operational summary; never expose upstream exception text."""

    try:
        rows = supabase_client.get_stations()
    except Exception:
        return _result(
            ready=False,
            checks={"source_of_truth": False, "station_data": False},
            reason="source_of_truth_unavailable",
        )

    ages = [
        station_freshness(row.get("recorded_at"), now=datetime.now(UTC)) for row in rows
    ]
    fresh_count = sum(
        item["age_minutes"] is not None
        and item["age_minutes"] <= settings.readiness_max_station_age_minutes
        for item in ages
    )
    latest = max(
        (str(row["recorded_at"]) for row in rows if row.get("recorded_at")),
        default=None,
    )
    has_rows = bool(rows)
    has_fresh_data = fresh_count > 0
    reason = None
    if not has_rows:
        reason = "station_data_missing"
    elif not has_fresh_data:
        reason = "station_data_stale"
    return _result(
        ready=has_rows and has_fresh_data,
        checks={"source_of_truth": True, "station_data": has_fresh_data},
        station_count=len(rows),
        fresh_station_count=fresh_count,
        latest_recorded_at=latest,
        reason=reason,
    )


def _result(
    *,
    ready: bool,
    checks: dict[str, bool],
    station_count: int = 0,
    fresh_station_count: int = 0,
    latest_recorded_at: str | None = None,
    reason: str | None = None,
) -> dict:
    return {
        "status": "ready" if ready else "not_ready",
        "service": "clearpath-api",
        "environment": settings.app_environment,
        "release": settings.release_sha,
        "checks": checks,
        "station_count": station_count,
        "fresh_station_count": fresh_station_count,
        "latest_recorded_at": latest_recorded_at,
        "reason": reason,
    }
