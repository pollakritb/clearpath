"""Grid-only reads cannot reach station snapshots or upstream providers."""

import asyncio
from datetime import UTC, datetime, timedelta

import pytest

from backend.algorithms.cams_grid import axis_index, freshness
from backend.services import external_forecast as service


def test_cell_midpoints_and_edges_match_browser():
    axis = [4.4, 4.8, 5.2]
    assert axis_index(axis, (4.4 + 4.8) / 2) == 1
    assert axis_index(axis, axis[0] - (axis[1] - axis[0]) / 2) == 0
    assert axis_index(axis, 5.4) == 2
    assert axis_index(axis, 5.4001) is None
    assert axis_index(axis, float("nan")) is None
    assert axis_index([], 5) is None
    assert axis_index([5], 5.1) is None


@pytest.mark.parametrize(
    "age,stale,expired",
    [(18, False, False), (18.01, True, False), (35.99, True, False), (36, True, True)],
)
def test_freshness_boundaries(age, stale, expired):
    now = datetime.now(UTC)
    state = freshness((now - timedelta(hours=age)).isoformat(), now=now)
    assert state["stale"] is stale and state["expired"] is expired


@pytest.mark.parametrize("value", [None, "bad", "2026-01-01", "2099-01-01T00:00:00Z"])
def test_invalid_timestamp_fails_closed(value):
    assert freshness(value, now=datetime.now(UTC))["expired"]


def fixture(monkeypatch, age=1, null_at=None):
    now = datetime.now(UTC)
    row = dict(
        id="CGN-000001",
        grid_id="test",
        retrieved_at=(now - timedelta(hours=age)).isoformat(),
    )
    monkeypatch.setattr(service.settings, "cams_grid_forecast_enabled", True)
    monkeypatch.setattr(service.grid_store, "active", lambda: row)
    monkeypatch.setattr(service.grid_store, "generation", lambda _: row)
    monkeypatch.setattr(
        service.grid_store,
        "grid",
        lambda _: dict(latitudes=[13.6, 14.0], longitudes=[100, 100.4]),
    )

    def point(generation, index, start, end):
        assert generation == row["id"] and index == 3
        first = now.replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)
        return [
            dict(
                forecast_at=(first + timedelta(hours=i)).isoformat(),
                pm25=None if i == null_at else i + 10,
            )
            for i in range(120)
        ]

    monkeypatch.setattr(service.grid_store, "point", point)

    def forbidden(*a, **kw):
        raise AssertionError("grid reads must not load station catalog or snapshots")

    monkeypatch.setattr(service.supabase_client, "get_stations", forbidden)
    monkeypatch.setattr(service.supabase_client, "get_recent_cams_snapshots", forbidden)
    return row


def test_area_reads_one_grid_cell_for_full_horizon(monkeypatch):
    fixture(monkeypatch)
    result = asyncio.run(service.area_forecast(14, 100.4, 120))
    assert len(result["points"]) == 120
    assert result["grid_lat"] == 14 and result["grid_lon"] == 100.4
    assert result["provenance"]["source_station_id"] is None
    assert result["sampling_method"] == "nearest"


def test_missing_cell_stops_contiguous_horizon(monkeypatch):
    fixture(monkeypatch, null_at=2)
    result = asyncio.run(service.area_forecast(14, 100.4, 120))
    assert len(result["points"]) == 2


def test_stale_and_expired_have_same_policy_as_map(monkeypatch):
    fixture(monkeypatch, age=19)
    result = asyncio.run(service.area_forecast(14, 100.4, 120))
    assert result["stale"] and "stored_cams_stale" in result["warnings"]
    fixture(monkeypatch, age=37)
    assert asyncio.run(service.area_forecast(14, 100.4, 120))["points"] == []


def test_missing_pinned_generation_never_switches_silently(monkeypatch):
    fixture(monkeypatch)
    monkeypatch.setattr(service.grid_store, "generation", lambda _: None)
    with pytest.raises(LookupError):
        asyncio.run(service.area_forecast(14, 100.4, 120, "CGN-000099"))
