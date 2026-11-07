"""Resolve place contributors privately; never return author IDs or group mappings."""

from datetime import datetime

from ...algorithms.community_quality import obfuscate_coordinates
from ...algorithms.place_reports import select_place_report_ids
from ...core.config import settings
from .. import supabase_client


def place_report_selection(lat: float, lon: float, at: datetime) -> list[str]:
    rows = supabase_client.get_map_history_reports(at, 180 + 1 / 60)
    public_rows = []
    for row in rows:
        public_lat, public_lon = row.get("public_lat"), row.get("public_lon")
        if public_lat is None or public_lon is None:
            public_lat, public_lon, _ = obfuscate_coordinates(
                float(row["lat"]),
                float(row["lon"]),
                secret_seed=f"{settings.effective_capture_secret}:{row.get('legacy_id') or row['id']}",
            )
        public_rows.append(dict(row, public_lat=public_lat, public_lon=public_lon))
    return select_place_report_ids(public_rows, lat, lon, at=at)
