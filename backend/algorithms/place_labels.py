"""Conservative labels: nearby named POI, administrative area, or no guess."""

from .distance import haversine_km


def _text(value) -> str:
    return " ".join(value.split()) if isinstance(value, str) else ""


def _label(
    row: dict, lat: float, lon: float, source: str, coordinates: tuple
) -> tuple[int, dict] | None:
    if _text(row.get("country_code") or row.get("countrycode")).lower() != "th":
        return None
    keys = (
        ("suburb", "district", "city", "county", "state")
        if source == "geoapify"
        else ("locality", "suburb", "district", "city", "county", "state")
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
        priority = 3
    elif areas:
        base = areas[0]
        priority = 2
    elif (
        name
        and not name.isnumeric()
        and (
            row.get("result_type") in {"suburb", "district", "city", "county", "state"}
            or (row.get("osm_key") == "place" and nearby)
        )
    ):
        base = name
        priority = 2
    elif nearby and _text(row.get("street")):
        base = _text(row["street"])
        priority = 1
    else:
        return None
    return priority, {
        "name": f"บริเวณ{base}",
        "address": " · ".join(areas),
        "source": source,
    }


def geoapify_label(payload: dict, lat: float, lon: float) -> dict | None:
    rows = payload.get("results", []) if isinstance(payload, dict) else []
    if not isinstance(rows, list):
        return None
    candidates = []
    for row in rows:
        if isinstance(row, dict):
            label = _label(row, lat, lon, "geoapify", (row.get("lat"), row.get("lon")))
            if label:
                candidates.append(label)
    return (
        max(candidates, key=lambda candidate: candidate[0])[1] if candidates else None
    )


def photon_label(payload: dict, lat: float, lon: float) -> dict | None:
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
            feature["properties"], lat, lon, "photon", (coordinates[1], coordinates[0])
        )
        if label:
            candidates.append(label)
    return (
        max(candidates, key=lambda candidate: candidate[0])[1] if candidates else None
    )
