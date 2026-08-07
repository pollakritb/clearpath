"""Operational API contracts."""

from typing import Literal

from pydantic import BaseModel


class ReadinessResponse(BaseModel):
    status: Literal["ready", "not_ready"]
    service: str = "clearpath-api"
    environment: str
    release: str
    checks: dict[str, bool]
    station_count: int
    fresh_station_count: int
    latest_recorded_at: str | None = None
    reason: str | None = None
