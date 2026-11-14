"""Conservative labels: nearby named POI, road, administrative area, or no guess."""

import math

from .distance import haversine_km


def _text(value) -> str:
    return " ".join(value.split()) if isinstance(value, str) else ""


def administrative_parts(row: dict) -> list[str]:
    """Do not treat Photon settlement/locality names as administrative areas.

    In Thailand, Photon can put a nearby village in `city` even for a campus
    spanning other settlements. County and state are its administrative parents.
    Keep smaller areas only when they are explicitly identified as such.
    """
    smaller = []
    for key in ("subdistrict", "suburb", "locality", "district", "city"):
        value = _text(row.get(key))
        if value.startswith(("ตำบล", "ต.", "แขวง", "อำเภอ", "อ.", "เขต")):
            smaller.append(value)
    state = _text(row.get("state"))
    if not state and _text(row.get("city")) == "กรุงเทพมหานคร":
        state = "กรุงเทพมหานคร"
    if "กรุงเทพ" in state:
        district = _text(row.get("district"))
        if district and not district.startswith(("บ้าน", "หมู่บ้าน")):
            smaller.append(district if district.startswith("เขต") else f"เขต{district}")
    county = _text(row.get("county"))
    return list(
        dict.fromkeys(
            [*smaller, *([county] if county else []), *([state] if state else [])]
        )
    )


def place_address(row: dict, province: str = "", *, street: bool = False) -> str:
    """Format available administrative parents and a containing province."""
    if province:
        row = {**row, "state": province}
    areas = administrative_parts(row)
    road = _text(row.get("street")) if street else ""
    return " · ".join(dict.fromkeys([*([road] if road else []), *areas]))


def _label(
    row: dict,
    lat: float,
    lon: float,
    source: str,
    coordinates: tuple,
    province: str = "",
) -> tuple[int, float, dict] | None:
    if _text(row.get("country_code") or row.get("countrycode")).lower() != "th":
        return None
    if province:
        row = {**row, "state": province}
    areas = administrative_parts(row)
    name = _text(row.get("name"))
    distance = math.inf
    try:
        target_lat, target_lon = map(float, coordinates)
        if -90 <= target_lat <= 90 and -180 <= target_lon <= 180:
            distance = haversine_km(lat, lon, target_lat, target_lon)
    except (TypeError, ValueError):
        pass
    nearby = distance <= 0.1
    poi = (
        row.get("result_type") in {"amenity", "building"}
        if source == "geoapify"
        else row.get("osm_key")
        in {"amenity", "shop", "leisure", "tourism", "office", "aeroway"}
    )
    road = _text(row.get("street")) or (
        name
        if row.get("osm_key") == "highway" or row.get("result_type") == "street"
        else ""
    )
    if nearby and poi and name and not name.isnumeric():
        base = name
        priority = 3
    elif nearby and road:
        base = road
        priority = 2
    elif areas:
        base = areas[0]
        priority = 1
    elif (
        name
        and not name.isnumeric()
        and (
            row.get("result_type") in {"suburb", "district", "city", "county", "state"}
            or (row.get("osm_key") == "place" and nearby)
        )
    ):
        base = name
        priority = 1
    else:
        return None
    return (
        priority,
        -distance,
        {
            "name": f"บริเวณ{base}",
            "address": " · ".join(areas),
            "source": source,
        },
    )


def geoapify_label(
    payload: dict, lat: float, lon: float, *, province: str = ""
) -> dict | None:
    rows = payload.get("results", []) if isinstance(payload, dict) else []
    if not isinstance(rows, list):
        return None
    candidates = []
    for row in rows:
        if isinstance(row, dict):
            label = _label(
                row, lat, lon, "geoapify", (row.get("lat"), row.get("lon")), province
            )
            if label:
                candidates.append(label)
    return (
        max(candidates, key=lambda candidate: candidate[:2])[2] if candidates else None
    )


def photon_label(
    payload: dict, lat: float, lon: float, *, province: str = ""
) -> dict | None:
    features = payload.get("features", []) if isinstance(payload, dict) else []
    if not isinstance(features, list):
        return None
    candidates = []
    for feature in features:
        if not isinstance(feature, dict) or not isinstance(
            feature.get("properties"), dict
        ):
            continue
        geometry = feature.get("geometry") or {}
        coordinates = (
            geometry.get("coordinates", []) if isinstance(geometry, dict) else []
        )
        if not isinstance(coordinates, list) or len(coordinates) < 2:
            continue
        label = _label(
            feature["properties"],
            lat,
            lon,
            "photon",
            (coordinates[1], coordinates[0]),
            province,
        )
        if label:
            candidates.append(label)
    return (
        max(candidates, key=lambda candidate: candidate[:2])[2] if candidates else None
    )
