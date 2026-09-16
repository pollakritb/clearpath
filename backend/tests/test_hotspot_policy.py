from datetime import UTC, datetime, timedelta

from backend.algorithms.area import is_nakhon_pathom
from backend.algorithms.hotspot_policy import (
    deduplicate_hotspots,
    public_hotspot_state,
)


def _point(lat: float, lon: float, acquired_at: datetime, **values):
    return {
        "lat": lat,
        "lon": lon,
        "acquired_at": acquired_at.isoformat(),
        "frp": values.get("frp", 5),
        "bright": values.get("bright", 320),
        "satellite": values.get("satellite", "VIIRS_SNPP_NRT"),
    }


def test_overlapping_satellite_passes_merge_and_keep_strongest_observation():
    acquired = datetime(2026, 9, 16, 4, tzinfo=UTC)
    rows = deduplicate_hotspots(
        [
            _point(13.82, 100.06, acquired, frp=5),
            _point(
                13.8205,
                100.0605,
                acquired + timedelta(minutes=10),
                frp=25,
                satellite="VIIRS_NOAA20_NRT",
            ),
            _point(13.82, 100.06, acquired + timedelta(hours=2), frp=8),
        ]
    )

    assert len(rows) == 2
    merged = next(row for row in rows if row["frp"] == 25)
    assert merged["id"].startswith("firms-")
    assert merged["source_products"] == [
        "VIIRS_NOAA20_NRT",
        "VIIRS_SNPP_NRT",
    ]


def test_public_hotspots_apply_polygon_time_boundary_and_future_guard():
    now = datetime(2026, 9, 16, 12, tzinfo=UTC)
    state = public_hotspot_state(
        [
            _point(13.82, 100.06, now - timedelta(hours=12)),
            _point(13.83, 100.07, now - timedelta(hours=12, seconds=1)),
            _point(13.82, 100.06, now + timedelta(minutes=1)),
            _point(13.7563, 100.5018, now - timedelta(hours=1)),
        ],
        area_contains=is_nakhon_pathom,
        now=now,
    )

    assert len(state["fires"]) == 1
    assert state["fires"][0]["acquired_at"] == (now - timedelta(hours=12)).isoformat()
    assert state["stale_count"] == 1
    assert state["max_age_hours"] == 12
