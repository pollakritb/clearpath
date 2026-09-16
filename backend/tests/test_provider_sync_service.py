from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta

import pytest

from backend.core.config import settings
from backend.core.errors import UpstreamError
from backend.services import provider_sync


def _stations():
    return [
        {"id": "station-1", "lat": 13.8, "lon": 100.1},
        {"id": "station-2", "lat": 14.0, "lon": 100.3},
        {"id": "bad-lat", "lat": 200, "lon": 100},
        {"id": "missing"},
    ]


def _install_store(monkeypatch):
    created: list[dict] = []
    snapshots: list[dict] = []
    updated: list[tuple[str, dict]] = []
    monkeypatch.setattr(provider_sync.supabase_client, "get_stations", _stations)
    monkeypatch.setattr(
        provider_sync.supabase_client,
        "create_provider_sync_run",
        lambda row: created.append(row) or row,
    )
    monkeypatch.setattr(
        provider_sync.supabase_client,
        "upsert_provider_snapshots",
        lambda rows: snapshots.extend(rows) or len(rows),
    )
    monkeypatch.setattr(
        provider_sync.supabase_client,
        "update_provider_sync_run",
        lambda run_id, values: updated.append((run_id, values)),
    )
    return created, snapshots, updated


def _forecast(pm25: float = 20):
    return [
        {
            "forecast_at": (datetime.now(UTC) + timedelta(hours=3)).isoformat(),
            "pm25": pm25,
        }
    ]


def test_provider_due_gates_disabled_not_due_and_failed_results(monkeypatch):
    monkeypatch.setattr(settings, "openweather_air_enabled", False)
    monkeypatch.setattr(settings, "openmeteo_air_enabled", False)
    monkeypatch.setattr(settings, "gistda_air_enabled", False)
    monkeypatch.setattr(settings, "gistda_license_approved", False)
    assert asyncio.run(provider_sync.sync_openweather_if_due())["status"] == "disabled"
    assert asyncio.run(provider_sync.sync_openmeteo_if_due())["status"] == "disabled"
    assert asyncio.run(provider_sync.sync_gistda_if_due())["status"] == "disabled"

    monkeypatch.setattr(
        provider_sync.supabase_client,
        "get_latest_provider_sync_run",
        lambda _provider: {
            "status": "success",
            "completed_at": datetime.now(UTC).isoformat(),
        },
    )

    async def should_not_run():
        raise AssertionError("not-due provider must not run")

    result = asyncio.run(provider_sync._sync_if_due("openweather", should_not_run))
    assert result["status"] == "not_due"
    assert result["interval_hours"] == 8

    monkeypatch.setattr(
        provider_sync.supabase_client,
        "get_latest_provider_sync_run",
        lambda _provider: None,
    )

    async def failed():
        return {"ok": False}

    with pytest.raises(UpstreamError):
        asyncio.run(provider_sync._sync_if_due("openweather", failed))


def test_station_and_snapshot_normalization(monkeypatch):
    monkeypatch.setattr(provider_sync.supabase_client, "get_stations", _stations)
    valid = provider_sync._valid_stations()
    assert [row["id"] for row in valid] == ["station-1", "station-2"]

    issued = datetime(2026, 9, 16, tzinfo=UTC)
    rows = provider_sync._snapshots(
        provider="openweather",
        run_id="run-1",
        issued_at=issued,
        station_id="station-1",
        rows=[
            {"forecast_at": "2026-09-16T03:00:00", "pm25": -5},
            {"forecast_at": "2026-09-16T06:00:00Z", "pm25": 10},
        ],
    )
    assert [row["horizon_hours"] for row in rows] == [3, 6]
    assert [row["pm25"] for row in rows] == [0.0, 10.0]


def test_openweather_sync_records_partial_success(monkeypatch):
    created, snapshots, updated = _install_store(monkeypatch)

    async def get_forecast(lat: float, _lon: float):
        if lat == 14.0:
            raise RuntimeError("station unavailable")
        return _forecast()

    monkeypatch.setattr(provider_sync.openweather_air, "get_forecast", get_forecast)
    result = asyncio.run(provider_sync.sync_openweather())

    assert result["status"] == "partial"
    assert result["stations"] == 2
    assert result["snapshots"] == 1
    assert result["errors"] == 1
    assert created[0]["provider"] == "openweather"
    assert snapshots[0]["station_id"] == "station-1"
    assert updated[0][1]["metadata"]["failed_station_ids"] == ["station-2"]


def test_gistda_sync_records_success_behind_legal_metadata(monkeypatch):
    created, snapshots, updated = _install_store(monkeypatch)

    async def get_forecast(_lat: float, _lon: float):
        return _forecast(18)

    monkeypatch.setattr(provider_sync.gistda_air, "get_forecast", get_forecast)
    result = asyncio.run(provider_sync.sync_gistda())

    assert result["status"] == "success"
    assert result["snapshots"] == 2
    assert created[0]["metadata"] == {"licence_gate": "approved"}
    assert all(row["provider"] == "gistda" for row in snapshots)
    assert updated[0][1]["metadata"]["licence_gate"] == "approved"


def test_openmeteo_sync_records_partial_and_failure(monkeypatch):
    _created, snapshots, updated = _install_store(monkeypatch)

    async def partial(_stations):
        return {"station-1": _forecast(16)}

    monkeypatch.setattr(provider_sync.openmeteo_air, "get_forecasts", partial)
    result = asyncio.run(provider_sync.sync_openmeteo())
    assert result["status"] == "partial"
    assert result["errors"] == 1
    assert snapshots[0]["provider"] == "openmeteo_cams"

    async def failure(_stations):
        raise RuntimeError("CAMS unavailable")

    monkeypatch.setattr(provider_sync.openmeteo_air, "get_forecasts", failure)
    with pytest.raises(RuntimeError, match="CAMS unavailable"):
        asyncio.run(provider_sync.sync_openmeteo())
    assert updated[-1][1]["status"] == "failed"
    assert updated[-1][1]["error_count"] == 2
