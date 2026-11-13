"""Shared delivery cutoff, including sends made outside the daemon."""

from datetime import UTC, datetime

from .config import settings


def delivery_window_open(now: datetime | None = None) -> bool:
    deadline = settings.line_delivery_until
    if deadline is None:
        return True
    # Treat a misconfigured naive timestamp as UTC, never local machine time.
    deadline = deadline.replace(tzinfo=UTC) if deadline.tzinfo is None else deadline
    return (now or datetime.now(UTC)) < deadline
