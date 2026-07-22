"""Local Nakhon Pathom gazetteer contracts."""

from typing import Literal

from pydantic import BaseModel


class LocationSuggestion(BaseModel):
    id: str
    name: str
    district: str
    kind: Literal["district", "subdistrict"]
    lat: float
    lon: float


class LocationSearchResponse(BaseModel):
    locations: list[LocationSuggestion]
