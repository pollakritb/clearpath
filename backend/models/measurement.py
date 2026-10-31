"""Public contracts: helper coordinates never appear in another user's response."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

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


class MeasurementHelperSettings(BaseModel):
    enabled: bool = False
    observed_at: str | None = None


class MeasurementHelperConsent(BaseModel):
    enabled: bool


class MeasurementPresenceUpdate(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    accuracy_m: float = Field(ge=0, le=200)
    observed_at: datetime


class MeasurementRequestView(BaseModel):
    help_claim: HelpClaim | None = None
    xp_enabled: bool = False
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
    result: CommunityReport | None = None
    result_distance_km: float | None = None


class MeasurementRequestsResponse(BaseModel):
    requests: list[MeasurementRequestView] = Field(default_factory=list)
