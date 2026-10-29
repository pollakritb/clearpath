"""Read only published stored grids. Never fetch upstream on a public read."""

from datetime import UTC, datetime, timedelta

from ..algorithms.cams_grid import crop_indices
from . import forecast_grid_store as store


def metadata() -> dict:
    row = store.active()
    now = datetime.now(UTC)
    if not row or not any(
        datetime.fromisoformat(at.replace("Z", "+00:00"))
        >= now.replace(minute=0, second=0, microsecond=0)
        for at in row["valid_times"]
    ):
        return {"status": "unavailable"}
    grid = store.grid(row["grid_id"])
    fetched = datetime.fromisoformat(row["retrieved_at"].replace("Z", "+00:00"))
    return {
        "status": "ready",
        "generation_id": row["id"],
        "grid_version": grid["id"],
        "latitudes": grid["latitudes"],
        "longitudes": grid["longitudes"],
        "valid_times": row["valid_times"],
        "retrieved_at": row["retrieved_at"],
        "retrieval_started_at": row["started_at"],
        "model_issued_at": None,
        "stale": now - fetched > timedelta(hours=18),
    }


def frames(generation_id: str, start: datetime, end: datetime, bounds: tuple) -> dict:
    row = store.generation(generation_id)
    if not row:
        raise LookupError("forecast_grid_generation_unavailable")
    grid = store.grid(row["grid_id"])
    r0, r1, c0, c1 = crop_indices(grid["latitudes"], grid["longitudes"], bounds)
    width = len(grid["longitudes"])
    data = store.frames(generation_id, start.isoformat(), end.isoformat())
    return {
        "generation_id": generation_id,
        "grid_version": grid["id"],
        "row_start": r0,
        "column_start": c0,
        "rows": r1 - r0 + 1,
        "columns": c1 - c0 + 1,
        "frames": [
            {
                "valid_at": f["valid_at"],
                "values": [
                    f["values"][r * width + c]
                    for r in range(r0, r1 + 1)
                    for c in range(c0, c1 + 1)
                ],
            }
            for f in data
        ],
    }
