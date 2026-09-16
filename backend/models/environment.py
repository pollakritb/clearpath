"""Weather and NASA FIRMS contracts."""

from typing import Literal

from pydantic import BaseModel, Field


class Weather(BaseModel):
    temp: float
    humidity: float
    wind_speed: float
    wind_deg: float
    description: str
    icon: str | None = None
    source: Literal["openweather", "open_meteo"] = "openweather"


class FirePoint(BaseModel):
    id: str
    lat: float
    lon: float
    frp: float | None = None
    bright: float | None = None
    daynight: str | None = None
    acq_date: str | None = None
    acquired_at: str | None = None
    confidence: str | None = None
    satellite: str | None = None
    source_products: list[str] = Field(default_factory=list)


class FirmsResponse(BaseModel):
    fires: list[FirePoint]
    count: int
    available: bool = True
    status: Literal[
        "available",
        "checked_no_hotspots",
        "stale",
        "unavailable",
        "unconfigured",
    ]
    checked_at: str
    latest_acquired_at: str | None = None
    max_age_hours: int = 12
    message: str | None = None
    source: Literal["nasa_firms"] = "nasa_firms"
