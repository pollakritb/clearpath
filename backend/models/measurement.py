"""Public contracts: helper coordinates never appear in another user's response."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from .community import CommunityReport
from .xp import HelpClaim

RequestStatus = Literal["scheduled", "active", "fulfilled", "expired", "cancelled"]


class MeasurementRequestCreate(BaseModel):
    place_name: str = Field(min_length=1, max_length=160)
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    radius_km: Literal[1, 3, 5] = 3
    needed_by: datetime | None = None
    idempotency_key: UUID


class MeasurementHelperLocationWrite(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    address: str = Field(default="", max_length=240)
    lat: float = Field(ge=-90, le=90, allow_inf_nan=False)
    lon: float = Field(ge=-180, le=180, allow_inf_nan=False)
    enabled: bool = True

    @field_validator("name")
    @classmethod
    def nonblank_name(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("ระบุชื่อพื้นที่")
        return value.strip()


class MeasurementHelperLocation(MeasurementHelperLocationWrite):
    slot: Literal[1, 2]


class MeasurementHelperSettings(BaseModel):
    enabled: bool = False
    observed_at: str | None = None
    registered_locations_enabled: bool = False
    locations: list[MeasurementHelperLocation] = Field(default_factory=list)


class MeasurementHelperConsent(BaseModel):
    enabled: bool


class MeasurementPresenceUpdate(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    accuracy_m: float = Field(ge=0, le=200)
    observed_at: datetime


class MeasurementRequestView(BaseModel):
    requester_name: str | None = None
    help_claim: HelpClaim | None = None
    xp_enabled: bool = False
    automatic_help_enabled: bool = False
    id: str
    place_name: str
    lat: float
    lon: float
    radius_km: Literal[1, 3, 5]
    starts_at: str
    expires_at: str
    created_at: str
    status: RequestStatus
    is_owner: bool
    recipient_count: int = 0
    declined: bool = False
    matched_location_at: str | None = None
    matched_location_source: Literal["gps", "registered"] | None = None
    result: CommunityReport | None = None
    result_distance_km: float | None = None


class MeasurementRequestsResponse(BaseModel):
    requests: list[MeasurementRequestView] = Field(default_factory=list)
