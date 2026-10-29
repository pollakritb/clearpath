"""Public stored CAMS grid contract. UTC timestamps; null means no data."""

from typing import Literal

from pydantic import BaseModel


class ForecastGridMetadata(BaseModel):
    status: Literal["ready", "unavailable"]
    generation_id: str | None = None
    grid_version: str | None = None
    provider: str = "openmeteo_cams"
    domain: str = "cams_global"
    unit: str = "µg/m³"
    retrieved_at: str | None = None
    retrieval_started_at: str | None = None
    model_issued_at: str | None = None
    stale: bool = False
    latitudes: list[float] = []
    longitudes: list[float] = []
    valid_times: list[str] = []
    bounds: list[float] = [5, 97, 21, 106]
    native_resolution_degrees: float = 0.4
    native_time_step_hours: int = 3
    attribution: str = "CAMS / Copernicus · Open-Meteo"
    attribution_url: str = "https://open-meteo.com/en/docs/air-quality-api"


class ForecastGridFrame(BaseModel):
    valid_at: str
    values: list[float | None]


class ForecastGridFrames(BaseModel):
    generation_id: str
    grid_version: str
    row_start: int
    column_start: int
    rows: int
    columns: int
    frames: list[ForecastGridFrame]
