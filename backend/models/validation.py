"""Interpolation validation contracts."""

from pydantic import BaseModel


class LoocvMetrics(BaseModel):
    n: int
    mae: float | None = None
    rmse: float | None = None
    me: float | None = None
    r2: float | None = None
    skill: float | None = None


class ValidationResponse(BaseModel):
    idw: LoocvMetrics | None = None
    kriging: LoocvMetrics | None = None
    mean: LoocvMetrics | None = None
    nearest: LoocvMetrics | None = None
    station_count: int
    better: str | None = None
