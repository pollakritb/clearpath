"""Explainable evidence, separate from contribution and instrument accuracy."""

from typing import Literal

from pydantic import BaseModel, Field


class EvidenceComponent(BaseModel):
    code: str
    maximum: int
    points: int
    state: Literal["verified", "declared", "invalid", "unknown"]
    reason: str


class ReportEvidence(BaseModel):
    policy_version: str = "evidence-v2"
    score: float
    components: list[EvidenceComponent]
    blockers: list[str]
    scored_at: str | None = None
    device_evaluated_at: str | None = None
    device_valid_until: str | None = None
    device_method: str | None = None
    device_status: Literal["unknown", "identified", "evaluation_available"] = "unknown"


class HistoryCheckSummary(BaseModel):
    passed: int = 0
    problems: int = 0
    unresolved: int = 0
    evaluated: int = 0
    pass_rate: float | None = None
    status: str = "insufficient"
    scope: str = "independent_evidence_checks"
    first_checked_at: str | None = None
    last_checked_at: str | None = None


class EvidenceHistory(HistoryCheckSummary):
    scopes: dict[str, HistoryCheckSummary] = Field(default_factory=dict)


class ContributionMission(BaseModel):
    id: str
    place_name: str
    lat: float
    lon: float
    radius_km: float = 2
    starts_at: str
    expires_at: str
    potential_points: int = 5


class ContributionMissions(BaseModel):
    missions: list[ContributionMission] = Field(default_factory=list)
