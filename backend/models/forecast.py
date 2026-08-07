"""Short-term PM2.5 forecast contracts."""

from typing import Literal

from pydantic import BaseModel


class ForecastQuality(BaseModel):
    status: Literal["limited", "sufficient"]
    ml_eligible: bool
    reason_codes: list[str]
    warnings: list[str]
    source_recorded_at: str | None
    input_freshness_minutes: float | None
    source_points: int
    recent_required_points: int
    missing_hours: int
    duplicate_hours: int
    optional_feature_completeness: float
    optional_feature_states: dict[str, str]


class ForecastPoint(BaseModel):
    horizon_hours: int
    forecast_at: str
    pm25: float
    lower: float
    upper: float
    method: str
    model_version: str | None = None
    feature_version: str | None = None
    artifact_sha256: str | None = None
    coverage_target: float
    calibration_version: str
    agreement: Literal["high", "medium", "low"] | None = None
    provider_count: int = 1


class ForecastSourcePoint(BaseModel):
    source: Literal["clearpath", "openweather", "openmeteo_cams"]
    horizon_hours: int
    forecast_at: str
    pm25: float
    lower: float | None = None
    upper: float | None = None
    weight: float = 1.0
    available: bool = True


class ForecastResponse(BaseModel):
    station_id: str
    generated_at: str
    source_recorded_at: str | None = None
    horizon_hours: int
    method: str
    source_points: int
    model_version: str | None = None
    feature_version: str | None = None
    artifact_sha256: str | None = None
    coverage_target: float
    data_quality: Literal["limited", "sufficient"]
    quality: ForecastQuality
    fallback_reason: str | None = None
    fallback_reason_codes: list[str]
    warnings: list[str]
    points: list[ForecastPoint]
    forecast_status: Literal["available", "limited", "unavailable"] = "limited"
    unavailable_reason_codes: list[str] = []
    agreement: Literal["high", "medium", "low"] | None = None
    provider_count: int = 1
    sources: list[ForecastSourcePoint] = []
    provenance: dict = {}


class ForecastSurfaceCell(BaseModel):
    lat: float
    lon: float
    pm25: float | None
    lower: float | None
    upper: float | None
    coverage: Literal["covered", "sparse", "unavailable"]
    nearby_station_count: int
    nearest_station_km: float | None


class ForecastSurfaceResponse(BaseModel):
    generated_at: str
    horizon_hours: int
    method: str
    source_policy: Literal["official_stations_only"]
    station_count: int
    grid_size: int
    bounds: dict[str, float]
    coverage_counts: dict[str, int]
    warnings: list[str]
    cells: list[ForecastSurfaceCell]
