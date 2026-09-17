"""Pure helpers for selecting raw external forecast horizons."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta


def select_horizon_rows(
    rows: list[dict], horizons: list[int], *, now: datetime | None = None
) -> list[dict]:
    """Return the closest future provider row for each requested horizon.

    Provider values are returned unchanged.  This helper only aligns hourly
    timestamps to the product horizons and performs no interpolation, bias
    correction, blending, or local forecast calculation.
    """

    reference = (now or datetime.now(UTC)).astimezone(UTC)
    candidates: list[tuple[datetime, dict]] = []
    for row in rows:
        try:
            timestamp = datetime.fromisoformat(
                str(row["forecast_at"]).replace("Z", "+00:00")
            )
            if timestamp.tzinfo is None:
                timestamp = timestamp.replace(tzinfo=UTC)
            pm25 = float(row["pm25"])
        except (KeyError, TypeError, ValueError):
            continue
        if pm25 < 0:
            continue
        candidates.append((timestamp.astimezone(UTC), {**row, "pm25": pm25}))

    selected: list[dict] = []
    for horizon in sorted(set(horizons)):
        target = reference + timedelta(hours=horizon)
        future = [item for item in candidates if item[0] >= reference]
        if not future:
            continue
        timestamp, row = min(
            future,
            key=lambda item: (abs((item[0] - target).total_seconds()), item[0]),
        )
        selected.append(
            {
                **row,
                "horizon_hours": horizon,
                "forecast_at": timestamp.isoformat(),
            }
        )
    return selected
