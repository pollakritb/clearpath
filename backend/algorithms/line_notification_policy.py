"""Pure allowlist and source eligibility for automatic LINE notifications."""

from __future__ import annotations

from uuid import NAMESPACE_URL, UUID, uuid5

LINE_EVENT_TYPES = frozenset(
    {"measurement_request", "measurement_fulfilled", "air_alert"}
)


def line_event_type(payload: dict) -> str | None:
    if payload.get("event_type"):
        return str(payload["event_type"])
    if payload.get("measurement_group_id"):
        return "measurement_request"
    if payload.get("measurement_kind"):
        return str(payload["measurement_kind"])
    tag = str(payload.get("tag") or "")
    if tag.startswith("measurement-group:"):
        return "measurement_request"
    if tag.startswith("measurement:"):
        parts = tag.split(":")
        return parts[2] if len(parts) >= 4 else None
    if tag.startswith("alert:pm25:"):
        return "air_alert"
    return None


def line_retry_key(event_id: str, existing: object = None) -> str:
    try:
        UUID(str(existing))
        return str(existing)
    except (ValueError, TypeError, AttributeError):
        return str(uuid5(NAMESPACE_URL, f"clearpath-line:{event_id}"))
