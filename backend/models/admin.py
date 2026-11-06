"""Private administrator request contracts; not part of the public API barrel."""

from typing import Literal

from pydantic import BaseModel


class DataHealthResponse(BaseModel):
    status: Literal["healthy", "degraded", "critical"]
    observed_at: str
    station_count: int
    fresh_station_count: int
    delayed_station_count: int
    expired_station_count: int
    stale_station_ratio: float
    latest_recorded_at: str | None = None
    latest_sync_status: str | None = None
    latest_sync_started_at: str | None = None
    latest_sync_completed_at: str | None = None
    latest_sync_duration_ms: float | None = None
    latest_primary_sync_at: str | None = None
    latest_primary_sync_status: str | None = None
    latest_backup_sync_at: str | None = None
    latest_backup_sync_status: str | None = None
    primary_sync_missed: bool
    consecutive_sync_failures: int
    upstream_failure: bool
    alert_codes: list[str]
