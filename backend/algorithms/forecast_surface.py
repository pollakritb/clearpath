"""Pure haversine-IDW forecast surface and sparse-area coverage mask."""

from __future__ import annotations

import math
from collections.abc import Sequence

from .area import NAKHON_PATHOM_POLYGON, point_in_polygon
from .distance import haversine_km
from .idw import idw_value


def surface_cell(
    lat: float,
    lon: float,
    station_forecasts: Sequence[dict],
    *,
    sparse_distance_km: float = 30.0,
    strong_distance_km: float = 10.0,
) -> dict:
    usable = []
    for station in station_forecasts:
        try:
            values = (
                float(station["pm25"]),
                float(station["lower"]),
                float(station["upper"]),
                float(station["lat"]),
                float(station["lon"]),
            )
        except (KeyError, TypeError, ValueError):
            continue
        if all(math.isfinite(value) for value in values):
            usable.append(station)
    if not usable:
        return {
            "lat": lat,
            "lon": lon,
            "pm25": None,
            "lower": None,
            "upper": None,
            "coverage": "unavailable",
            "nearby_station_count": 0,
            "nearest_station_km": None,
        }
    distances = [
        haversine_km(lat, lon, float(row["lat"]), float(row["lon"])) for row in usable
    ]
    nearest = min(distances)
    nearby_count = sum(distance <= sparse_distance_km for distance in distances)
    if nearest > sparse_distance_km:
        coverage = "unavailable"
    elif nearest <= strong_distance_km or nearby_count >= 2:
        coverage = "covered"
    else:
        coverage = "sparse"
    if coverage == "unavailable":
        values = {"pm25": None, "lower": None, "upper": None}
    else:
        values = {
            field: idw_value(
                lat,
                lon,
                [
                    {
                        "lat": row["lat"],
                        "lon": row["lon"],
                        "pm25": row[field],
                    }
                    for row in usable
                ],
            )
            for field in ("pm25", "lower", "upper")
        }
    return {
        "lat": round(lat, 6),
        "lon": round(lon, 6),
        **{
            key: round(value, 1) if value is not None else None
            for key, value in values.items()
        },
        "coverage": coverage,
        "nearby_station_count": nearby_count,
        "nearest_station_km": round(nearest, 2),
    }


def forecast_surface(
    station_forecasts: Sequence[dict],
    *,
    grid_size: int = 12,
    polygon: Sequence[tuple[float, float]] = NAKHON_PATHOM_POLYGON,
    bounds: dict[str, float] | None = None,
) -> dict:
    if not 4 <= grid_size <= 30:
        raise ValueError("surface_grid_size_out_of_range")
    if bounds:
        min_lat = float(bounds["min_lat"])
        max_lat = float(bounds["max_lat"])
        min_lon = float(bounds["min_lon"])
        max_lon = float(bounds["max_lon"])
        if min_lat >= max_lat or min_lon >= max_lon:
            raise ValueError("surface_bounds_invalid")
    else:
        lons = [point[0] for point in polygon]
        lats = [point[1] for point in polygon]
        min_lon, max_lon = min(lons), max(lons)
        min_lat, max_lat = min(lats), max(lats)
    cells = []
    for row_index in range(grid_size):
        lat = min_lat + (max_lat - min_lat) * row_index / (grid_size - 1)
        for column_index in range(grid_size):
            lon = min_lon + (max_lon - min_lon) * column_index / (grid_size - 1)
            if bounds or point_in_polygon(lat, lon, polygon):
                cells.append(surface_cell(lat, lon, station_forecasts))
    counts = {
        status: sum(cell["coverage"] == status for cell in cells)
        for status in ("covered", "sparse", "unavailable")
    }
    return {
        "grid_size": grid_size,
        "bounds": {
            "min_lat": min_lat,
            "max_lat": max_lat,
            "min_lon": min_lon,
            "max_lon": max_lon,
        },
        "coverage_counts": counts,
        "cells": cells,
    }
