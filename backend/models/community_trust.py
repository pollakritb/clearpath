"""Community opinion contracts; independent reporter audits remain separate."""

from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class CommunityTrustDay(BaseModel):
    day: str
    positive: int
    negative: int
    count: int
    value: float
    weight: int


class CommunityTrust(BaseModel):
    policy_version: str = "community-trust-v1"
    status: Literal["insufficient", "available", "updating", "unavailable"] = (
        "insufficient"
    )
    score: float | None = None
    window_start: str | None = None
    window_end: str | None = None
    unique_voter_accounts: int = 0
    evaluated_report_count: int = 0
    evaluated_day_count: int = 0
    effective_day_weight: int = 0
    last_feedback_at: str | None = None
    calculated_at: str | None = None
    contribution_days_30: int = 0
    review_available: bool = False
    daily: list[CommunityTrustDay] = Field(default_factory=list)


class CommunityTrustReview(BaseModel):
    model_config = ConfigDict(extra="forbid")
    report_id: str | None = None
    from_day: date | None = None
    to_day: date | None = None
    message: str = Field(min_length=10, max_length=1000)


class CommunityTrustReviewItem(BaseModel):
    id: str
    status: str
    created_at: str
    from_day: str | None = None
    to_day: str | None = None
    message: str | None = None
    reason: str | None = None


class CommunityTrustReviews(BaseModel):
    requests: list[CommunityTrustReviewItem] = Field(default_factory=list)
