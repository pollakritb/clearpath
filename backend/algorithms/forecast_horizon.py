"""Describe stored time coverage without treating past slots as future data."""

from datetime import UTC, datetime, timedelta


def forecast_horizon(
    times: list[str], now: datetime, requested_hours: int = 120
) -> dict:
    if now.tzinfo is None:
        raise ValueError("timezone-aware reference required")
    anchor = now.astimezone(UTC).replace(minute=0, second=0, microsecond=0)
    parsed = set()
    for raw in times:
        try:
            at = datetime.fromisoformat(raw.replace("Z", "+00:00"))
            if at.tzinfo is not None:
                parsed.add(at.astimezone(UTC))
        except (ValueError, TypeError, AttributeError):
            continue
    future = sorted(at for at in parsed if at >= anchor)
    expected = {anchor + timedelta(hours=i) for i in range(requested_hours)}
    return {
        "coverage_as_of": now.astimezone(UTC).isoformat(),
        "available_from": future[0].isoformat() if future else None,
        "available_until": future[-1].isoformat() if future else None,
        "future_time_count": len(future),
        "past_time_count": len(parsed) - len(future),
        "future_horizon_hours": round(
            max(0, (future[-1] - now).total_seconds() / 3600), 1
        )
        if future
        else 0,
        "requested_horizon_hours": requested_hours,
        "coverage_status": "complete"
        if expected <= parsed
        else "partial"
        if future
        else "unavailable",
    }
