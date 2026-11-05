"""Server ingestion of independently produced evaluation artifacts, never Admin UI."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from ...core.config import settings
from ...core.errors import UpstreamError
from .. import supabase_client as db
from . import policy_v2


class IndependentEvaluation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    evaluation_key: str = Field(min_length=8, max_length=200)
    user_id: str
    report_id: str
    scope: Literal["image", "metadata", "field_protocol", "instrument"]
    outcome: Literal["pass", "problem", "unresolved"]
    provenance: str = Field(min_length=10, max_length=2000)
    evaluated_at: datetime
    # Explicit independent finding. An ordinary failed image extraction isn't fraud.
    invalidates_contribution: bool = False
    source_key: str | None = Field(default=None, min_length=8, max_length=200)
    instrument: dict | None = None

    @model_validator(mode="after")
    def validate_scope(self):
        if self.evaluated_at.tzinfo is None:
            raise ValueError("evaluation timestamp must include timezone")
        if self.invalidates_contribution and self.outcome != "problem":
            raise ValueError(
                "only an independently confirmed problem may invalidate awards"
            )
        if self.source_key and (
            self.scope not in {"field_protocol", "instrument"} or self.outcome != "pass"
        ):
            raise ValueError(
                "source identity requires a passing controlled observation"
            )
        if self.instrument:
            if (
                self.scope != "instrument"
                or self.outcome != "pass"
                or not self.source_key
            ):
                raise ValueError(
                    "instrument evaluation requires a passing scoped result and independent source"
                )
            for key in ("method", "reference_instrument", "valid_until", "conditions"):
                if not self.instrument.get(key):
                    raise ValueError("missing instrument evidence: " + key)
            until = datetime.fromisoformat(
                self.instrument["valid_until"].replace("Z", "+00:00")
            )
            if until.tzinfo is None or until <= self.evaluated_at:
                raise ValueError("invalid instrument evidence validity")
        return self


def ingest(payload: dict) -> dict:
    value = IndependentEvaluation.model_validate(payload).model_dump(mode="json")
    if settings.local_demo_mode:
        from .. import local_store

        report = db.get_community_report(value["report_id"])
        if not report or str(report["user_id"]) != value["user_id"]:
            raise ValueError("evaluation subject mismatch")
        existing = next(
            (
                r
                for r in policy_v2.DEMO_OUTCOMES
                if r["evaluation_key"] == value["evaluation_key"]
            ),
            None,
        )
        if existing:
            if existing != value:
                raise ValueError("evaluation_key_conflict")
            return existing
        policy_v2.DEMO_OUTCOMES.append(value)
        issues = set(report.get("current_evidence_issues") or [])
        issue = "independent_" + value["scope"] + "_problem"
        if value["outcome"] == "problem":
            issues.add(issue)
        elif value["outcome"] == "pass":
            issues.discard(issue)
        changes = {"current_evidence_issues": sorted(issues)}
        if value["source_key"]:
            changes["measurement_source_key"] = value["source_key"]
        if value["instrument"] and report.get("evidence_v2"):
            changes["device_evaluation_valid_until"] = value["instrument"][
                "valid_until"
            ]
            changes["evidence_v2"] = report["evidence_v2"] | {
                "device_status": "evaluation_available",
                "device_evaluated_at": value["evaluated_at"],
                "device_valid_until": value["instrument"]["valid_until"],
                "device_method": value["instrument"]["method"],
            }
        if changes:
            local_store.update_report(value["report_id"], changes)
        return value
    try:
        return (
            db.get_client()
            .rpc("ingest_community_evaluation", {"p_payload": value})
            .execute()
            .data
        )
    except Exception as exc:
        raise UpstreamError("บันทึกผลประเมินอิสระไม่สำเร็จ") from exc
