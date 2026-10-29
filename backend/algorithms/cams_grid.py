"""Regular CAMS Global grid validation. Pure: no I/O, no station interpolation."""

from __future__ import annotations

import hashlib
import json
import math
from datetime import UTC, datetime

GRID_VERSION = "cams-global-0.4-th-v1"
LATITUDES = [round(4.4 + i * 0.4, 1) for i in range(44)]
LONGITUDES = [round(96.4 + i * 0.4, 1) for i in range(26)]
BATCH_SIZE = 25
CELL_COUNT = len(LATITUDES) * len(LONGITUDES)
BATCH_COUNT = math.ceil(CELL_COUNT / BATCH_SIZE)


def definition() -> dict:
    return {"id": GRID_VERSION, "latitudes": LATITUDES, "longitudes": LONGITUDES}


def batch_points(index: int) -> list[dict]:
    if not 0 <= index < BATCH_COUNT:
        raise ValueError("grid_batch_invalid")
    return [
        {
            "index": i,
            "lat": LATITUDES[i // len(LONGITUDES)],
            "lon": LONGITUDES[i % len(LONGITUDES)],
        }
        for i in range(index * BATCH_SIZE, min((index + 1) * BATCH_SIZE, CELL_COUNT))
    ]


def normalize_batch(payload: object, points: list[dict]) -> dict:
    locations = payload if isinstance(payload, list) else [payload]
    if len(locations) != len(points):
        raise ValueError("grid_location_count_mismatch")
    times: list[str] | None = None
    cells = []
    for location, point in zip(locations, points, strict=True):
        if not isinstance(location, dict):
            raise ValueError("grid_location_invalid")
        lat, lon = float(location["latitude"]), float(location["longitude"])
        if abs(lat - point["lat"]) > 0.001 or abs(lon - point["lon"]) > 0.001:
            raise ValueError("grid_geometry_changed")
        if location.get("hourly_units", {}).get("pm2_5") not in {"μg/m³", "µg/m³"}:
            raise ValueError("grid_unit_invalid")
        hourly = location["hourly"]
        current_times = []
        for raw in hourly["time"]:
            at = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
            if at.tzinfo is None:
                at = at.replace(tzinfo=UTC)
            current_times.append(at.astimezone(UTC).isoformat())
        values = hourly["pm2_5"]
        if (
            not current_times
            or len(values) != len(current_times)
            or len(current_times) > 120
        ):
            raise ValueError("grid_time_length_invalid")
        if current_times != sorted(set(current_times)):
            raise ValueError("grid_time_order_invalid")
        if times is not None and times != current_times:
            raise ValueError("grid_times_mismatch")
        times = current_times
        cleaned = []
        for value in values:
            if value is None:
                cleaned.append(None)
            elif (
                isinstance(value, (int, float))
                and not isinstance(value, bool)
                and math.isfinite(value)
                and 0 <= value <= 2000
            ):
                cleaned.append(float(value))
            else:
                raise ValueError("grid_value_invalid")
        cells.append({"index": point["index"], "values": cleaned})
    return {"times": times, "cells": cells}


def assemble(chunks: list[dict]) -> tuple[list[dict], str]:
    if len(chunks) != BATCH_COUNT:
        raise ValueError("grid_batches_incomplete")
    times = chunks[0]["times"]
    cells: dict[int, list] = {}
    for chunk in chunks:
        if chunk["times"] != times:
            raise ValueError("grid_times_mismatch")
        for cell in chunk["cells"]:
            index = cell["index"]
            if index in cells or len(cell["values"]) != len(times):
                raise ValueError("grid_cell_order_invalid")
            cells[index] = cell["values"]
    if set(cells) != set(range(CELL_COUNT)):
        raise ValueError("grid_cells_incomplete")
    frames = [
        {"valid_at": at, "values": [cells[i][t] for i in range(CELL_COUNT)]}
        for t, at in enumerate(times)
    ]
    if not any(value is not None for frame in frames for value in frame["values"]):
        raise ValueError("grid_all_values_missing")
    fingerprint = hashlib.sha256(
        json.dumps(frames, separators=(",", ":"), allow_nan=False).encode()
    ).hexdigest()
    return frames, fingerprint


def crop_indices(
    lats: list[float], lons: list[float], bounds: tuple[float, float, float, float]
) -> tuple[int, int, int, int]:
    south, west, north, east = bounds

    def span(axis, lo, hi):
        below = [i for i, value in enumerate(axis) if value <= lo]
        above = [i for i, value in enumerate(axis) if value >= hi]
        return max(0, (below[-1] if below else 0) - 1), min(
            len(axis) - 1, (above[0] if above else len(axis) - 1) + 1
        )

    r0, r1 = span(lats, south, north)
    c0, c1 = span(lons, west, east)
    return r0, r1, c0, c1
