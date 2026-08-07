"""Pure, conservative district normalization for Nakhon Pathom sources."""

from __future__ import annotations

import unicodedata

DISTRICTS = (
    "เมืองนครปฐม",
    "กำแพงแสน",
    "นครชัยศรี",
    "ดอนตูม",
    "บางเลน",
    "สามพราน",
    "พุทธมณฑล",
)

# Air4Thai station 81t is the official monitor at Nakhon Pathom municipality.
# Keep overrides explicit and reviewable; do not infer administrative boundaries
# from nearest centroids.
OFFICIAL_STATION_DISTRICTS = {"81t": "เมืองนครปฐม"}


def _normalized(value: object) -> str:
    return "".join(unicodedata.normalize("NFKC", str(value or "")).lower().split())


def resolve_station_district(station_id: object, area_th: object) -> str | None:
    station = str(station_id or "")
    if station in OFFICIAL_STATION_DISTRICTS:
        return OFFICIAL_STATION_DISTRICTS[station]
    area = _normalized(area_th)
    for district in DISTRICTS:
        normalized = _normalized(district)
        if f"อ.{normalized}" in area or f"อำเภอ{normalized}" in area:
            return district
    return None
