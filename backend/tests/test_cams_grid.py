from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from backend.algorithms import cams_grid as grid
from backend.core.errors import UpstreamError
from backend.main import create_app
from backend.services import (
    forecast_grid_store,
    forecast_grid_sync,
    openmeteo_grid,
)


def payload(points, times=None):
    return [
        {
            "latitude": p["lat"] + 0.000001,
            "longitude": p["lon"] - 0.000001,
            "hourly_units": {"pm2_5": "μg/m³"},
            "hourly": {
                "time": times or ["2030-01-01T00:00", "2030-01-01T01:00"],
                "pm2_5": [10, None],
            },
        }
        for p in points
    ]


def test_grid_unique_regular_coverage_and_deduplication():
    points = [p for i in range(grid.BATCH_COUNT) for p in grid.batch_points(i)]
    assert len(points) == grid.CELL_COUNT == 1144
    assert len({(p["lat"], p["lon"]) for p in points}) == 1144
    assert grid.LATITUDES[0] < 5 and grid.LATITUDES[-1] > 21
    assert grid.LONGITUDES[0] < 97 and grid.LONGITUDES[-1] > 106
    with pytest.raises(ValueError):
        grid.batch_points(-1)


def test_normalize_keeps_nulls_time_and_tolerates_float_coordinates():
    points = grid.batch_points(0)
    chunk = grid.normalize_batch(payload(points), points)
    assert chunk["times"] == ["2030-01-01T00:00:00+00:00", "2030-01-01T01:00:00+00:00"]
    assert chunk["cells"][0]["values"] == [10, None]


@pytest.mark.parametrize(
    "kind",
    [
        "geometry",
        "count",
        "unit",
        "negative",
        "nan",
        "time_order",
        "missing_time",
        "different_times",
    ],
)
def test_normalize_rejects_invalid_provider_grid(kind):
    points = grid.batch_points(0)
    rows = payload(points)
    if kind == "geometry":
        rows[0]["latitude"] += 0.1
    if kind == "count":
        rows.pop()
    if kind == "unit":
        rows[0]["hourly_units"]["pm2_5"] = "ppm"
    if kind == "negative":
        rows[0]["hourly"]["pm2_5"][0] = -1
    if kind == "nan":
        rows[0]["hourly"]["pm2_5"][0] = float("nan")
    if kind == "time_order":
        rows[0]["hourly"]["time"].reverse()
    if kind == "missing_time":
        rows[0]["hourly"]["time"].pop()
    if kind == "different_times":
        rows[1]["hourly"]["time"][0] = "2029-01-01T00:00"
    with pytest.raises(ValueError):
        grid.normalize_batch(rows, points)


def chunks():
    return [
        grid.normalize_batch(payload(grid.batch_points(i)), grid.batch_points(i))
        for i in range(grid.BATCH_COUNT)
    ]


def test_assemble_stable_cell_order_and_fail_closed():
    parts = chunks()
    frames, fingerprint = grid.assemble(parts)
    assert len(frames[0]["values"]) == 1144 and frames[1]["values"] == [None] * 1144
    assert grid.assemble(list(reversed(parts)))[1] == fingerprint
    with pytest.raises(ValueError):
        grid.assemble(parts[:-1])
    parts[1]["cells"][0]["index"] = 0
    with pytest.raises(ValueError):
        grid.assemble(parts)


def test_bbox_includes_supporting_neighbor_nodes():
    assert grid.crop_indices(
        [5, 6, 7, 8], [97, 98, 99, 100], (6.1, 98.1, 6.8, 98.8)
    ) == (0, 3, 0, 3)


def test_read_metadata_and_generation_pinned_cropped_frames(monkeypatch):
    future = (datetime.now(UTC) + timedelta(hours=2)).isoformat()
    row = {
        "id": str(uuid4()),
        "grid_id": "grid",
        "valid_times": [future],
        "started_at": future,
        "retrieved_at": datetime.now(UTC).isoformat(),
    }
    monkeypatch.setattr(forecast_grid_store, "active", lambda: row)
    monkeypatch.setattr(
        forecast_grid_store, "generation", lambda gid: row if gid == row["id"] else None
    )
    monkeypatch.setattr(
        forecast_grid_store,
        "grid",
        lambda _: {"id": "grid", "latitudes": [5, 6, 7], "longitudes": [97, 98, 99]},
    )
    monkeypatch.setattr(
        forecast_grid_store,
        "frames",
        lambda *args: [{"valid_at": future, "values": [1, 2, 3, 4, None, 6, 7, 8, 9]}],
    )
    client = TestClient(create_app())
    meta = client.get("/api/forecast-grid/metadata")
    assert meta.status_code == 200 and meta.json()["generation_id"] == row["id"]
    assert meta.json()["model_issued_at"] is None
    params = {
        "generation_id": row["id"],
        "start": future,
        "end": future,
        "min_lat": 5,
        "max_lat": 7,
        "min_lon": 97,
        "max_lon": 99,
    }
    result = client.get("/api/forecast-grid/frames", params=params)
    assert result.status_code == 200 and result.json()["frames"][0]["values"][4] is None
    assert result.json()["generation_id"] == row["id"]
    params["generation_id"] = str(uuid4())
    assert client.get("/api/forecast-grid/frames", params=params).status_code == 410
    params["end"] = (datetime.now(UTC) + timedelta(days=10)).isoformat()
    assert client.get("/api/forecast-grid/frames", params=params).status_code == 422
    params["start"] = "2030-01-01T00:00"
    assert client.get("/api/forecast-grid/frames", params=params).status_code == 422
    monkeypatch.setattr(forecast_grid_store, "active", lambda: None)
    assert client.get("/api/forecast-grid/metadata").json()["status"] == "unavailable"


def test_sync_is_gated_checkpointed_and_failure_does_not_publish(monkeypatch):
    settings = forecast_grid_sync.settings
    monkeypatch.setattr(settings, "cams_grid_collection_enabled", False)
    assert asyncio.run(forecast_grid_sync.sync()) == {"status": "disabled"}
    monkeypatch.setattr(settings, "cams_grid_collection_enabled", True)
    monkeypatch.setattr(settings, "cams_snapshot_expected_supabase_ref", "local-test")
    monkeypatch.setattr(settings, "supabase_url", "https://local-test.supabase.co")
    calls = []

    def rpc(name, params):
        calls.append((name, params))
        return (
            {"status": "claimed", "id": "job", "next_batch": 0}
            if name == "claim_cams_grid"
            else {}
        )

    monkeypatch.setattr(forecast_grid_store, "rpc", rpc)

    async def fetch(points):
        return grid.normalize_batch(payload(points), points)

    monkeypatch.setattr(openmeteo_grid, "fetch_batch", fetch)
    assert asyncio.run(forecast_grid_sync.sync())["status"] == "collecting"
    assert [c[0] for c in calls] == [
        "claim_cams_grid",
        "checkpoint_cams_grid",
        "release_cams_grid",
    ]
    calls.clear()

    async def fail(points):
        raise UpstreamError("upstream unavailable")

    monkeypatch.setattr(openmeteo_grid, "fetch_batch", fail)
    with pytest.raises(UpstreamError):
        asyncio.run(forecast_grid_sync.sync())
    assert calls[-1][1]["p_error"] is True
    assert not any(c[0] == "publish_cams_grid" for c in calls)


def test_finalization_is_separate_and_rejects_changed_upstream(monkeypatch):
    settings = forecast_grid_sync.settings
    monkeypatch.setattr(settings, "cams_grid_collection_enabled", True)
    monkeypatch.setattr(settings, "cams_snapshot_expected_supabase_ref", "local-test")
    monkeypatch.setattr(settings, "supabase_url", "https://local-test.supabase.co")
    parts = chunks()
    calls = []

    def rpc(name, params):
        calls.append((name, params))
        if name == "claim_cams_grid":
            return {"status": "claimed", "id": "job", "next_batch": grid.BATCH_COUNT}
        return {"status": "ready"}

    monkeypatch.setattr(forecast_grid_store, "rpc", rpc)
    monkeypatch.setattr(forecast_grid_store, "chunks", lambda _: parts)

    async def anchor(points):
        return parts[0]

    monkeypatch.setattr(openmeteo_grid, "fetch_batch", anchor)
    assert asyncio.run(forecast_grid_sync.sync()) == {"status": "ready"}
    assert [name for name, _ in calls] == ["claim_cams_grid", "publish_cams_grid"]
    assert len(calls[-1][1]["p_frames"][0]["values"]) == 1144
    calls.clear()

    async def changed(points):
        return {"times": [], "cells": []}

    monkeypatch.setattr(openmeteo_grid, "fetch_batch", changed)
    with pytest.raises(UpstreamError):
        asyncio.run(forecast_grid_sync.sync())
    assert calls[-1][0] == "release_cams_grid"
    assert not any(name == "publish_cams_grid" for name, _ in calls)
