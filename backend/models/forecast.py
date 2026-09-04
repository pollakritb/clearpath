"""Short-term PM2.5 forecast contracts."""

from typing import Literal

from pydantic import BaseModel, Field

ForecastSource = Literal["clearpath", "gistda", "openmeteo_cams", "openweather"]


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
    source: ForecastSource = "clearpath"


class ForecastSourcePoint(BaseModel):
    source: ForecastSource
    horizon_hours: int
    forecast_at: str
    pm25: float
    lower: float | None = None
    upper: float | None = None
    weight: float = 1.0
    available: bool = True
    issued_at: str | None = None


class ForecastProviderSummary(BaseModel):
    source: Literal["gistda", "openmeteo_cams", "openweather"]
    label: str
    attribution: str
    attribution_url: str
    available: bool
    selected: bool
    latest_issued_at: str | None
    freshness_status: Literal["fresh", "stale", "unavailable"]
    coverage_hours: int
    maximum_horizon_hours: int
    stale_after_hours: int
    usage_note: str


class ForecastCommunityContext(BaseModel):
    mode: Literal["not_used", "context_only", "shadow", "served"]
    affects_recommendation: bool
    eligible_report_count: int
    nearby_report_count: int
    effective_sample_size: float
    residual_pm25: float
    trust_threshold: int = 60
    radius_km: float = 5.0
    policy: str = "approved-fresh-trust-corroborated-v1"


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
    limitation_reason_codes: list[str] = Field(default_factory=list)
    unavailable_reason_codes: list[str] = Field(default_factory=list)
    agreement: Literal["high", "medium", "low"] | None = None
    provider_count: int = 1
    sources: list[ForecastSourcePoint] = Field(default_factory=list)
    provenance: dict = Field(default_factory=dict)
    forecast_mode: Literal["external_provider", "local_fallback", "unavailable"]
    recommended_source: ForecastSource | None = None
    providers: list[ForecastProviderSummary] = Field(default_factory=list)
    community_context: ForecastCommunityContext


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
