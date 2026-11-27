"""Shared point-in-polygon geometry and nationwide intake bounds."""

from __future__ import annotations

from collections.abc import Sequence


def point_in_polygon(
    lat: float,
    lon: float,
    polygon: Sequence[tuple[float, float]],
) -> bool:
    """Return whether a WGS84 point is inside a lon/lat polygon."""
    inside = False
    previous_lon, previous_lat = polygon[-1]
    for current_lon, current_lat in polygon:
        crosses = (current_lat > lat) != (previous_lat > lat)
        if crosses:
            boundary_lon = (previous_lon - current_lon) * (lat - current_lat) / (
                previous_lat - current_lat
            ) + current_lon
            if lon < boundary_lon:
                inside = not inside
        previous_lon, previous_lat = current_lon, current_lat
    return inside


def is_thailand(lat: float, lon: float) -> bool:
    """Conservative WGS84 national intake guard; province is resolved server-side."""
    return 5.5 <= lat <= 20.6 and 97.2 <= lon <= 105.8
