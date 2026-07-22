"""Short-term PM2.5 forecast contracts."""

from pydantic import BaseModel


class ForecastPoint(BaseModel):
    forecast_at: str
    pm25: float
    lower: float
    upper: float


class ForecastResponse(BaseModel):
    station_id: str
    generated_at: str
    horizon_hours: int
    method: str
    source_points: int
    model_version: str | None = None
    data_quality: str = "limited"
    fallback_reason: str | None = None
    points: list[ForecastPoint]
