"""Public reporter Trust never exposes audit subjects, sample keys or provenance."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ReporterTrust(BaseModel):
    policy_version: str = "reporter-trust-v1"
    status: Literal["evaluated", "insufficient", "unavailable"] = "insufficient"
    validation_status: Literal["candidate", "validated"] = "candidate"
    score: float | None = None
    passed: int = 0
    problems: int = 0
    unresolved: int = 0
    evaluated: int = 0
    excluded_cases: int = 0
    prior_alpha: float = 2
    prior_beta: float = 2
    first_checked_at: str | None = None
    last_checked_at: str | None = None


class ReporterAuditView(BaseModel):
    audit_key: str
    report_id: str
    revision: int
    outcome: Literal["pass", "problem", "unresolved"]
    fault_domain: Literal["reporting", "device", "system", "unknown"]
    evaluated_at: str


class ReporterAuditHistory(BaseModel):
    audits: list[ReporterAuditView]
    next_offset: int | None = None


class ReporterReviewRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    audit_key: str = Field(min_length=8, max_length=200)
    message: str = Field(min_length=10, max_length=1000)


class ReporterReviewResult(BaseModel):
    id: str
    status: Literal["pending", "reviewed"]
