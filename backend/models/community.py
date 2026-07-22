"""Community evidence, moderation and reward contracts."""

from typing import Literal

from pydantic import BaseModel, Field

ReportStatus = Literal["pending", "approved", "rejected"]
CommunityDataRole = Literal["supplementary", "gap_fill"]
GapFillBasis = Literal["none", "corroborated", "calibrated_high_trust"]
RatingDirection = Literal["negative", "neutral", "positive"]
RejectionReason = Literal[
    "image_unclear",
    "value_mismatch",
    "suspected_screen_recapture",
    "invalid_location",
    "invalid_measurement",
    "duplicate",
    "other",
]
AnnouncementStatus = Literal["draft", "published", "archived", "expired"]


class CaptureSessionResponse(BaseModel):
    token: str
    session_id: str
    issued_at: str
    expires_at: str


class CommunityReport(BaseModel):
    id: str
    user_id: str
    display_name: str | None = None
    lat: float
    lon: float
    # Public PM2.5 is present only after an administrator approves the evidence.
    pm25: float | None = None
    ocr_pm25: float | None = None
    user_claimed_pm25: float | None = None
    admin_verified_pm25: float | None = None
    ocr_confidence: float = 0.0
    captured_at: str
    created_at: str
    status: ReportStatus
    trust_score: float
    trust_reasons: list[str] = Field(default_factory=list)
    peer_up: int = 0
    peer_down: int = 0
    image_url: str | None = None
    admin_verified: bool = False
    data_role: CommunityDataRole = "supplementary"
    nearest_official_distance_km: float | None = None
    nearest_official_pm25: float | None = None
    eligible_for_gap_fill: bool = False
    is_fresh: bool = True
    age_minutes: float | None = None
    location_precision_m: int = 0
    device_model: str | None = None
    device_calibrated: bool = False
    calibrated_at: str | None = None
    measurement_environment: Literal["outdoor", "indoor"] = "outdoor"
    measurement_stable: bool = True
    near_emission_source: bool = False
    measurement_note: str | None = None
    gps_accuracy_m: float | None = None
    duplicate_detected: bool = False
    corroboration_count: int = 0
    gap_fill_basis: GapFillBasis = "none"
    eligibility_reason: str = ""
    official_recorded_at: str | None = None
    averaging_period: Literal["instant", "1_minute", "5_minutes"] = "instant"
    measurement_duration_seconds: int = 0
    province: str | None = None
    district: str | None = None
    subdistrict: str | None = None
    camera_session_issued_at: str | None = None
    client_captured_at: str | None = None
    server_received_at: str | None = None
    moderated_at: str | None = None
    clock_warning: bool = False
    ocr_mismatch: bool = False
    rejection_reason_code: RejectionReason | None = None
    moderation_checks: dict[str, bool] = Field(default_factory=dict)
    evidence_purged_at: str | None = None
    policy_version: str = "trust-v2"
    rating_count: int = 0
    rating_average: float | None = None


class CommunityReportsResponse(BaseModel):
    reports: list[CommunityReport]
    count: int


class CommunityMapPoint(BaseModel):
    id: str
    lat: float
    lon: float
    pm25: float
    report_count: int
    reporter_count: int
    source: Literal["community"] = "community"
    averaging_period: Literal["instant"] = "instant"
    report_ids: list[str]


class CommunityMapPointsResponse(BaseModel):
    points: list[CommunityMapPoint]
    count: int


class ReportCreateResponse(BaseModel):
    report: CommunityReport
    ocr_available: bool
    message: str


class ReportDraftResponse(BaseModel):
    id: str
    ocr_pm25: float | None = None
    ocr_confidence: float = 0.0
    ocr_available: bool = False
    device_detected: bool = False
    display_clear: bool = False
    duplicate_detected: bool = False
    clock_warning: bool = False
    captured_at: str
    expires_at: str
    image_preview_url: str | None = None


class ReportDraftSubmit(BaseModel):
    user_claimed_pm25: float = Field(ge=0, le=1000)
    display_name: str | None = Field(default=None, max_length=80)
    device_model: str | None = Field(default=None, max_length=80)
    device_calibrated: bool = False
    calibrated_at: str | None = Field(default=None, max_length=10)
    measurement_environment: Literal["outdoor"] = "outdoor"
    measurement_stable: bool = True
    near_emission_source: bool = False
    measurement_note: str | None = Field(default=None, max_length=300)
    averaging_period: Literal["instant", "1_minute", "5_minutes"] = "instant"
    measurement_duration_seconds: int = Field(default=60, ge=60, le=600)


class ReportRatingRequest(BaseModel):
    rating: int = Field(ge=1, le=5)
    reviewer_lat: float = Field(ge=-90, le=90)
    reviewer_lon: float = Field(ge=-180, le=180)
    gps_accuracy_m: float = Field(ge=0, le=200)
    note: str | None = Field(default=None, max_length=300)


class RatingResult(BaseModel):
    report: CommunityReport
    rating_count: int
    rating_average: float
    consensus: RatingDirection
    reward_points: int = 0


class ModerationChecks(BaseModel):
    image_clear: bool = False
    value_matches_display: bool = False
    location_plausible: bool = False
    no_screen_recapture_signs: bool = False


class ModerationRequest(BaseModel):
    decision: Literal["approve", "reject"]
    verified_pm25: float | None = Field(default=None, ge=0, le=1000)
    rejection_reason_code: RejectionReason | None = None
    checks: ModerationChecks = Field(default_factory=ModerationChecks)
    note: str | None = Field(default=None, max_length=500)


class UserReputation(BaseModel):
    user_id: str
    display_name: str | None = None
    reputation_score: int = 0
    approved_reports: int = 0
    helpful_reviews: int = 0
    weekly_points: int = 0
    badges: list[str] = Field(default_factory=list)
    role: Literal["user", "moderator", "admin"] = "user"


class CommunityProfileResponse(UserReputation):
    created_at: str | None = None
    reports: list[CommunityReport] = Field(default_factory=list)


class LeaderboardResponse(BaseModel):
    users: list[UserReputation]


class Announcement(BaseModel):
    id: str
    title: str
    body: str
    kind: Literal["news", "alert", "community"] = "community"
    area: str | None = None
    published_at: str
    expires_at: str | None = None
    status: AnnouncementStatus = "published"
    image_url: str | None = None
    created_at: str | None = None
    updated_at: str | None = None


class AnnouncementsResponse(BaseModel):
    announcements: list[Announcement]


class AnnouncementCreate(BaseModel):
    title: str
    body: str
    kind: Literal["news", "alert", "community"] = "community"
    area: str | None = None
    expires_at: str | None = None
    status: AnnouncementStatus = "published"
    image_path: str | None = None


class AnnouncementUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    body: str | None = Field(default=None, max_length=10000)
    kind: Literal["news", "alert", "community"] | None = None
    area: str | None = Field(default=None, max_length=200)
    expires_at: str | None = None
    status: AnnouncementStatus | None = None
    image_path: str | None = None


class Activity(BaseModel):
    id: str
    title: str
    description: str
    reward_points: int = 0
    starts_at: str | None = None
    ends_at: str | None = None
    active: bool = True


class ActivitiesResponse(BaseModel):
    activities: list[Activity]


class ActivityCreate(BaseModel):
    title: str
    description: str
    reward_points: int = 0
    starts_at: str | None = None
    ends_at: str | None = None
