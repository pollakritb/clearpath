"""Air-quality station and historical reading contracts."""

from typing import Literal

from pydantic import BaseModel, Field


class Station(BaseModel):
    id: str
    name_th: str | None = None
    name_en: str | None = None
    lat: float
    lon: float
    province: str | None = None
    pm25: float | None = None
    aqi: int | None = None
    color: str | None = None
    level: str | None = None
    recorded_at: str | None = None
    data_status: str = "expired"
    age_minutes: float | None = None
    eligible_for_surface: bool = False
    in_service_area: bool = False
    quality_flags: list[str] = Field(default_factory=list)


class StationsResponse(BaseModel):
    source: Literal["air4thai"] = "air4thai"
    stations: list[Station]
    count: int
    updated_at: str | None = None
    fresh_count: int = 0
    delayed_count: int = 0
    expired_count: int = 0


class HistoryPoint(BaseModel):
    recorded_at: str
    pm25: float | None = None
    aqi: int | None = None


class HistoryResponse(BaseModel):
    station_id: str
    points: list[HistoryPoint]


class MapHistoryResponse(BaseModel):
    target_at: str
    source: Literal["air4thai"] = "air4thai"
    stations: list[Station]
    count: int
    max_age_minutes: int
