"""Read only published stored grids. Never fetch upstream on a public read."""

from datetime import UTC, datetime

from ..algorithms.cams_grid import crop_indices, freshness
from ..algorithms.forecast_horizon import forecast_horizon
from . import forecast_grid_store as store


def metadata() -> dict:
    row = store.active()
    now = datetime.now(UTC)
    coverage = forecast_horizon(row["valid_times"] if row else [], now)
    state = freshness(row.get("retrieved_at") if row else None, now=now)
    if not row or state["expired"] or coverage["coverage_status"] == "unavailable":
        return {"status": "unavailable", **coverage}
    grid = store.grid(row["grid_id"])
    return {
        "status": "ready",
        **coverage,
        "generation_id": row["id"],
        "grid_version": grid["id"],
        "latitudes": grid["latitudes"],
        "longitudes": grid["longitudes"],
        "valid_times": row["valid_times"],
        "retrieved_at": row["retrieved_at"],
        "retrieval_started_at": row["started_at"],
        "model_issued_at": row.get("model_issued_at"),
        "stale": state["stale"],
        "expires_at": state["expires_at"],
    }


def frames(generation_id: str, start: datetime, end: datetime, bounds: tuple) -> dict:
    row = store.generation(generation_id)
    if not row or freshness(row.get("retrieved_at"), now=datetime.now(UTC))["expired"]:
        raise LookupError("forecast_grid_generation_unavailable")
    grid = store.grid(row["grid_id"])
    r0, r1, c0, c1 = crop_indices(grid["latitudes"], grid["longitudes"], bounds)
    width = len(grid["longitudes"])
    data = store.frames(generation_id, start.isoformat(), end.isoformat())
    return {
        "generation_id": row["id"],
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
