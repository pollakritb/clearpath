"""Select one eligible report per private author within a public-coordinate radius."""

from datetime import UTC, datetime
from math import isfinite

from .distance import haversine_km


def select_place_report_ids(
    rows: list[dict], lat: float, lon: float, *, at: datetime
) -> list[str]:
    candidates = []
    for row in rows:
        try:
            measured = datetime.fromisoformat(
                str(row["captured_at"]).replace("Z", "+00:00")
            )
            measured = (
                measured.replace(tzinfo=UTC) if measured.tzinfo is None else measured
            )
            age = (at - measured).total_seconds() / 60
            value = float(row["pm25"])
            distance = haversine_km(
                lat, lon, float(row["public_lat"]), float(row["public_lon"])
            )
            if (
                row.get("status") == "approved"
                and isfinite(value)
                and -5 <= age <= 180
                and distance <= 2
            ):
                candidates.append((measured, str(row["id"]), row))
        except (KeyError, TypeError, ValueError):
            continue
    candidates.sort(key=lambda item: (item[0], item[1]), reverse=True)
    authors: set[str] = set()
    selected = []
    for _, report_id, row in candidates:
        author = str(row.get("user_id") or f"report:{report_id}")
        if author not in authors:
            authors.add(author)
            selected.append(report_id)
    return selected
