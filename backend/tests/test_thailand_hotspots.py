"""Nationwide FIRMS coverage without leaking neighboring-country hotspots."""

import asyncio
import json
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from backend.algorithms.thailand_boundary import THAILAND_POLYGONS, is_in_thailand
from backend.services import fire_feed


@pytest.mark.parametrize(
    "lat,lon",
    [
        (13.7563, 100.5018),
        (18.7883, 98.9853),
        (6.5, 101.2),
        (7.88, 98.35),
        (9.5, 100.0),
        (12.04, 102.31),
    ],
)
def test_national_boundary_includes_mainland_and_islands(lat, lon):
    assert is_in_thailand(lat, lon)


@pytest.mark.parametrize(
    "lat,lon",
    [
        (16.5, 98.0),
        (17.9757, 102.6331),
        (13.36, 103.86),
        (6.12, 100.37),
        (10, 101),
        (float("nan"), 100),
        (13, float("inf")),
    ],
)
def test_national_boundary_excludes_neighbors_sea_and_invalid_coordinates(lat, lon):
    assert not is_in_thailand(lat, lon)


def test_hotspot_boundary_matches_the_map_boundary():
    path = (
        Path(__file__).resolve().parents[2] / "frontend/lib/geo/thailand-boundary.json"
    )
    assert (
        json.loads(json.dumps(THAILAND_POLYGONS))
        == json.loads(path.read_text())["coordinates"]
    )


def test_public_feed_covers_thailand_and_preserves_freshness_rules(monkeypatch):
    now = datetime(2026, 11, 7, 6, tzinfo=UTC)

    async def observations(_days):
        return [
            {
                "lat": lat,
                "lon": lon,
                "acquired_at": (now - timedelta(hours=hours)).isoformat(),
            }
            for lat, lon, hours in [
                (18.7883, 98.9853, 1),  # Chiang Mai: outside former province filter
                (7.88, 98.35, 12),  # Phuket: inclusive freshness boundary
                (13.7563, 100.5018, 13),  # stale Bangkok
                (17.9757, 102.6331, 1),  # Laos: inside upstream bounding box
                (6.5, 101.2, -1),  # future observation
            ]
        ]

    monkeypatch.setattr(fire_feed.firms, "get_fires", observations)
    result = asyncio.run(fire_feed.get_public_fires(1, now=now))
    assert result.status == "available"
    assert {(point["lat"], point["lon"]) for point in result.fires} == {
        (18.7883, 98.9853),
        (7.88, 98.35),
    }
    assert result.max_age_hours == 12
