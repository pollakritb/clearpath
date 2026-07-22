"""Weather and NASA FIRMS contracts."""

from pydantic import BaseModel


class Weather(BaseModel):
    temp: float
    humidity: float
    wind_speed: float
    wind_deg: float
    description: str
    icon: str | None = None


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
