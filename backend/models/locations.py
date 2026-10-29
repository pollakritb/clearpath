"""Public place-search contracts."""

from typing import Literal

from pydantic import BaseModel


class LocationSuggestion(BaseModel):
    id: str
    name: str
    address: str
    kind: str
    source: Literal["geoapify", "openstreetmap", "photon", "local"]
    lat: float
    lon: float


class LocationSearchResponse(BaseModel):
    locations: list[LocationSuggestion]
    coverage: Literal["nationwide", "limited"]


class LocationLabelResponse(BaseModel):
    name: str
    address: str
    source: Literal["geoapify", "photon", "local"]
