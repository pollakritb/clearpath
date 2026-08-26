"""Weather and NASA FIRMS contracts."""

from typing import Literal

from pydantic import BaseModel


class Weather(BaseModel):
    temp: float
    humidity: float
    wind_speed: float
    wind_deg: float
    description: str
    icon: str | None = None
    source: Literal["openweather", "open_meteo"] = "openweather"


class FirePoint(BaseModel):
    lat: float
    lon: float
    frp: float | None = None
    bright: float | None = None
    daynight: str | None = None
    acq_date: str | None = None
    acquired_at: str | None = None
    confidence: str | None = None
    satellite: str | None = None


class FirmsResponse(BaseModel):
    fires: list[FirePoint]
    count: int
    available: bool = True
    message: str | None = None
    source: Literal["nasa_firms"] = "nasa_firms"
