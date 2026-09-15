"""Pure data-freshness classification for official station readings."""

from __future__ import annotations

from datetime import UTC, datetime

FRESH_MAX_AGE_MINUTES = 60.0
DELAYED_MAX_AGE_MINUTES = 90.0


def station_freshness(recorded_at: str | None, now: datetime | None = None) -> dict:
    age: float | None = None
    try:
        recorded = datetime.fromisoformat(str(recorded_at).replace("Z", "+00:00"))
        if recorded.tzinfo is None:
            recorded = recorded.replace(tzinfo=UTC)
        age = max(0.0, ((now or datetime.now(UTC)) - recorded).total_seconds() / 60)
    except (TypeError, ValueError):
        pass
    status = (
        "fresh"
        if age is not None and age <= FRESH_MAX_AGE_MINUTES
        else "delayed"
        if age is not None and age <= DELAYED_MAX_AGE_MINUTES
        else "expired"
    )
    return {
        "data_status": status,
        "age_minutes": round(age, 1) if age is not None else None,
        "eligible_for_surface": status != "expired",
    }
