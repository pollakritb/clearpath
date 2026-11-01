"""Entity-scoped human identifiers. Security tokens are deliberately excluded."""

from __future__ import annotations

import re
from typing import Annotated
from uuid import UUID

from pydantic import AfterValidator, Field

PREFIXES = {
    "profiles": "USR",
    "capture_sessions": "CAP",
    "report_drafts": "DRF",
    "community_reports": "RPT",
    "report_comments": "CMT",
    "report_reviews": "REV",
    "reputation_events": "REP",
    "measurement_requests": "REQ",
    "user_notifications": "NTF",
    "notification_outbox": "OBX",
    "alert_events": "ALT",
    "announcements": "ANN",
    "activities": "ACT",
    "data_issue_reports": "ISS",
    "public_map_events": "MAP",
    "audit_logs": "AUD",
    "sync_runs": "SYN",
    "pm25_readings": "OBS",
    "forecast_provider_sync_runs": "CPS",
    "forecast_provider_snapshots": "CFS",
    "cams_grid_generations": "CGN",
    "cams_grid_jobs": "CGJ",
    "community_xp_events": "XPE",
    "community_members": "MBR",
}
UUID_ENTITIES = set(PREFIXES) - {
    "report_reviews",
    "reputation_events",
    "audit_logs",
    "pm25_readings",
}
MAX_ID = 2**63 - 1


def legacy_uuid(value: object) -> bool:
    try:
        return str(UUID(str(value))) == str(value).lower()
    except (TypeError, ValueError, AttributeError):
        return False


def number(entity: str, value: object) -> int:
    """Decode a code or an internal bigint; reject another entity's prefix."""
    raw = str(value)
    prefix = PREFIXES[entity] + "-"
    if raw.startswith(prefix):
        raw = raw[len(prefix) :]
    if not re.fullmatch(r"[0-9]{1,19}", raw):
        raise ValueError(f"invalid_{PREFIXES[entity].lower()}_identifier")
    result = int(raw)
    if not 0 < result <= MAX_ID:
        raise ValueError("identifier_out_of_range")
    return result


def code(entity: str, value: object) -> str:
    return f"{PREFIXES[entity]}-{number(entity, value):06d}"


def identifier_type(entity: str):
    def validate(value: str) -> str:
        if legacy_uuid(value):
            return value.lower()
        return code(entity, value)

    return Annotated[str, AfterValidator(validate), Field(max_length=64)]


RequestID = identifier_type("measurement_requests")
ReportID = identifier_type("community_reports")
XPEventID = identifier_type("community_xp_events")
MemberID = identifier_type("community_members")
GenerationID = identifier_type("cams_grid_generations")
