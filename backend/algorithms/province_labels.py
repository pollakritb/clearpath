"""Pure province containment for place labels, independent of PM2.5 coverage."""

import math
from collections.abc import Sequence

from .area import point_in_polygon


def province_label(provinces: Sequence[dict], lat: float, lon: float) -> dict | None:
    """Use the containing polygon, including holes; never the nearest centroid."""
    if not math.isfinite(lat) or not math.isfinite(lon):
        return None
    for province in provinces:
        west, south, east, north = province["bbox"]
        if not (west <= lon <= east and south <= lat <= north):
            continue
        for polygon in province["polygons"]:
            if point_in_polygon(lat, lon, polygon[0]) and not any(
                point_in_polygon(lat, lon, hole) for hole in polygon[1:]
            ):
                return {"name": province["name"], "address": "", "source": "local"}
    return None


def coordinate_label(lat: float, lon: float) -> dict:
    """An honest identifiable label when no containing land area is available."""
    return {
        "name": f"จุดที่เลือก ({lat:.5f}, {lon:.5f})",
        "address": "",
        "source": "local",
    }
