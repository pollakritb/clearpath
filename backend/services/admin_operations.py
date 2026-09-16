"""Auditable, concurrency-safe administrator operations."""

from __future__ import annotations

from datetime import UTC, datetime

from . import supabase_client


class StaleRecordError(ValueError):
    """The caller acted on an older representation of a mutable record."""


_DATA_ISSUE_TRANSITIONS = {
    "new": {"reviewing", "resolved", "dismissed"},
    "reviewing": {"resolved", "dismissed"},
    "resolved": set(),
    "dismissed": set(),
}


def transition_data_issue(
    *,
    issue_id: str,
    status: str,
    reason: str,
    expected_updated_at: str,
    actor_id: str,
) -> dict:
    """Move a private data issue through its workflow and persist the audit fact."""
    current = supabase_client.get_data_issue(issue_id)
    if not current:
        raise KeyError(issue_id)
    if str(current.get("updated_at")) != expected_updated_at:
        raise StaleRecordError("data_issue_stale")
    previous_status = str(current.get("status") or "new")
    if status == previous_status:
        return current
    if status not in _DATA_ISSUE_TRANSITIONS.get(previous_status, set()):
        raise ValueError("data_issue_transition_not_allowed")

    now = datetime.now(UTC).isoformat()
    updated = supabase_client.update_data_issue_if_current(
        issue_id,
        expected_updated_at,
        {"status": status, "updated_at": now},
    )
    if not updated:
        raise StaleRecordError("data_issue_stale")
    supabase_client.create_audit_log(
        {
            "actor_id": actor_id,
            "action": "data_issue_transitioned",
            "entity_type": "data_issue_report",
            "entity_id": issue_id,
            "details": {
                "before": {"status": previous_status},
                "after": {"status": status},
                "reason": reason.strip(),
            },
        }
    )
    return updated
