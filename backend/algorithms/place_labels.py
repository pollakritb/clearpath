"""Conservative labels: nearby named POI, administrative area, or no guess."""

from .distance import haversine_km


def _text(value) -> str:
    return " ".join(value.split()) if isinstance(value, str) else ""


def _label(
    row: dict, lat: float, lon: float, source: str, coordinates: tuple
) -> dict | None:
    if _text(row.get("country_code") or row.get("countrycode")).lower() != "th":
        return None
    keys = (
        ("suburb", "district", "city", "county", "state")
        if source == "geoapify"
        else ("locality", "district", "city", "county", "state")
    )
    areas = list(
        dict.fromkeys(_text(row.get(key)) for key in keys if _text(row.get(key)))
    )
    name = _text(row.get("name"))
    try:
        target_lat, target_lon = map(float, coordinates)
        nearby = (
            -90 <= target_lat <= 90
            and -180 <= target_lon <= 180
            and haversine_km(lat, lon, target_lat, target_lon) <= 0.1
        )
    except (TypeError, ValueError):
        nearby = False
    poi = (
        row.get("result_type") in {"amenity", "building"}
        if source == "geoapify"
        else row.get("osm_key")
        in {"amenity", "shop", "leisure", "tourism", "office", "aeroway"}
    )
    if nearby and poi and name and not name.isnumeric():
        base = name
    elif areas:
        base = areas[0]
    else:
        return None
    return {"name": f"บริเวณ{base}", "address": " · ".join(areas), "source": source}


def geoapify_label(payload: dict, lat: float, lon: float) -> dict | None:
    rows = payload.get("results", []) if isinstance(payload, dict) else []
    if not isinstance(rows, list):
        return None
    for row in rows:
        if isinstance(row, dict):
            label = _label(row, lat, lon, "geoapify", (row.get("lat"), row.get("lon")))
            if label:
                return label
    return None


def photon_label(payload: dict, lat: float, lon: float) -> dict | None:
    features = payload.get("features", []) if isinstance(payload, dict) else []
    if not isinstance(features, list):
        return None
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
            feature["properties"], lat, lon, "photon", (coordinates[1], coordinates[0])
        )
        if label:
            return label
    return None
