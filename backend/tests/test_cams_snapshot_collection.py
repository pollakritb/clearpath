"""Storage-only CAMS collection must not resume the paused forecast pipeline."""

import asyncio
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from backend.core.config import settings
from backend.core.errors import UpstreamError
from backend.main import app
from backend.services import provider_sync, supabase_client


def test_collect_cams_snapshots_stores_future_hours_without_predictions(monkeypatch):
    now = datetime.now(UTC).replace(minute=0, second=0, microsecond=0)
    station = {"id": "103t", "lat": 13.7, "lon": 100.5}
    runs = []
    updates = []
    saved = []
    monkeypatch.setattr(provider_sync, "_valid_stations", lambda: [station])
    monkeypatch.setattr(
        provider_sync,
        "_cleanup_cams_history",
        lambda: {"deleted_snapshots": 0, "deleted_runs": 0},
    )
    monkeypatch.setattr(
        supabase_client, "get_latest_provider_sync_run", lambda _provider: None
    )
    monkeypatch.setattr(
        supabase_client, "create_provider_sync_run", lambda row: runs.append(row)
    )
    monkeypatch.setattr(
        supabase_client,
        "update_provider_sync_run",
        lambda run_id, values: updates.append((run_id, values)),
    )
    monkeypatch.setattr(
        supabase_client,
        "upsert_provider_snapshots",
        lambda rows: saved.extend(rows) or len(rows),
    )
    monkeypatch.setattr(
        provider_sync,
        "_persist_provider_evidence",
        lambda **_kwargs: (_ for _ in ()).throw(AssertionError("prediction write")),
    )

    async def forecasts(_stations, *, forecast_days):
        assert forecast_days == 5
        return {
            "103t": [
                {
                    "forecast_at": (now + timedelta(hours=hour)).isoformat(),
                    "pm25": 12.5,
                    "source_lat": 13.8,
                    "source_lon": 100.6,
                    "fetched_at": now.isoformat(),
                }
                for hour in range(1, 107)
            ]
        }

    monkeypatch.setattr(provider_sync.openmeteo_air, "get_forecasts", forecasts)
    result = asyncio.run(provider_sync.collect_openmeteo_snapshots())

    assert result["status"] == "success"
    assert result["snapshot_count"] == 106
    assert len(saved) == 106
    assert {row["provider"] for row in saved} == {"openmeteo_cams"}
    assert saved[0]["raw_metadata"]["grid_lat"] == 13.8
    assert runs[0]["metadata"]["mode"] == "raw_cams_storage_only"
    assert runs[0]["metadata"]["horizon_hours"] == 120
    assert updates[0][1]["status"] == "success"


def test_collect_cams_snapshots_skips_recent_completed_run(monkeypatch):
    monkeypatch.setattr(
        supabase_client,
        "get_latest_provider_sync_run",
        lambda _provider: {
            "status": "success",
            "completed_at": datetime.now(UTC).isoformat(),
        },
    )
    result = asyncio.run(provider_sync.collect_openmeteo_snapshots())
    assert result["status"] == "not_due"


def test_collect_cams_snapshots_refreshes_legacy_short_horizon(monkeypatch):
    monkeypatch.setattr(
        supabase_client,
        "get_latest_provider_sync_run",
        lambda _provider: {
            "status": "success",
            "completed_at": datetime.now(UTC).isoformat(),
            "metadata": {"horizon_hours": 24},
        },
    )
    monkeypatch.setattr(provider_sync, "_valid_stations", lambda: [])

    result = asyncio.run(provider_sync.collect_openmeteo_snapshots())

    assert result["status"] == "no_stations"


def test_cams_batch_collects_only_its_stations(monkeypatch):
    now = datetime.now(UTC).replace(minute=0, second=0, microsecond=0)
    stations = [
        {"id": f"station-{index:02d}", "lat": 13.7, "lon": 100.5} for index in range(12)
    ]
    selected_ids = []
    runs = []
    monkeypatch.setattr(provider_sync, "_valid_stations", lambda: stations)
    monkeypatch.setattr(
        supabase_client,
        "get_latest_provider_sync_run",
        lambda _provider, *, batch_index: None,
    )
    monkeypatch.setattr(
        supabase_client, "create_provider_sync_run", lambda row: runs.append(row)
    )
    monkeypatch.setattr(supabase_client, "update_provider_sync_run", lambda *_: None)
    monkeypatch.setattr(
        supabase_client, "upsert_provider_snapshots", lambda rows: len(rows)
    )
    monkeypatch.setattr(provider_sync, "_cleanup_cams_history", lambda: {})

    async def forecasts(batch, *, forecast_days):
        assert forecast_days == 5
        selected_ids.extend(row["id"] for row in batch)
        return {
            row["id"]: [
                {
                    "forecast_at": (now + timedelta(hours=hour)).isoformat(),
                    "pm25": 10.0,
                    "source_lat": 13.8,
                    "source_lon": 100.6,
                    "fetched_at": now.isoformat(),
                }
                for hour in range(1, 107)
            ]
            for row in batch
        }

    monkeypatch.setattr(provider_sync.openmeteo_air, "get_forecasts", forecasts)
    result = asyncio.run(provider_sync.collect_openmeteo_snapshots(batch_index=2))
    assert selected_ids == ["station-02", "station-08"]
    assert result["snapshot_count"] == 212
    assert runs[0]["metadata"]["batch_index"] == 2


def test_collect_cams_snapshots_marks_missing_hour_partial(monkeypatch):
    now = datetime.now(UTC).replace(minute=0, second=0, microsecond=0)
    station = {"id": "103t", "lat": 13.7, "lon": 100.5}
    updates = []
    saved = []
    monkeypatch.setattr(provider_sync, "_valid_stations", lambda: [station])
    monkeypatch.setattr(
        provider_sync,
        "_cleanup_cams_history",
        lambda: {"deleted_snapshots": 0, "deleted_runs": 0},
    )
    monkeypatch.setattr(
        supabase_client, "get_latest_provider_sync_run", lambda _provider: None
    )
    monkeypatch.setattr(supabase_client, "create_provider_sync_run", lambda _row: None)
    monkeypatch.setattr(
        supabase_client,
        "update_provider_sync_run",
        lambda _id, values: updates.append(values),
    )
    monkeypatch.setattr(
        supabase_client,
        "upsert_provider_snapshots",
        lambda rows: saved.extend(rows) or len(rows),
    )

    async def forecasts(_stations, *, forecast_days):
        assert forecast_days == 5
        return {
            "103t": [
                {
                    "forecast_at": (now + timedelta(hours=hour)).isoformat(),
                    "pm25": 10.0,
                    "source_lat": 13.8,
                    "source_lon": 100.6,
                    "fetched_at": now.isoformat(),
                }
                for hour in (1, 2, 4, 5)
            ]
        }

    monkeypatch.setattr(provider_sync.openmeteo_air, "get_forecasts", forecasts)
    result = asyncio.run(provider_sync.collect_openmeteo_snapshots())

    assert result["status"] == "partial"
    assert result["snapshot_count"] == 2
    assert result["missing_station_count"] == 1
    assert len(saved) == 2
    assert updates[0]["metadata"]["incomplete_station_ids"] == ["103t"]


def test_collect_cams_snapshots_skips_active_run(monkeypatch):
    monkeypatch.setattr(
        supabase_client,
        "get_latest_provider_sync_run",
        lambda _provider: {
            "status": "running",
            "started_at": datetime.now(UTC).isoformat(),
        },
    )
    result = asyncio.run(provider_sync.collect_openmeteo_snapshots())
    assert result["status"] == "in_progress"


def test_cams_snapshot_route_is_authenticated_and_off_by_default(monkeypatch):
    monkeypatch.setattr(settings, "cron_secret", "cams-test-secret")
    monkeypatch.setattr(settings, "supabase_cron_secret", "")
    monkeypatch.setattr(settings, "cams_snapshot_collection_enabled", False)
    client = TestClient(app)
    assert client.get("/api/cron/cams-snapshots").status_code == 401
    result = client.get(
        "/api/cron/cams-snapshots",
        headers={"Authorization": "Bearer cams-test-secret"},
    )
    assert result.status_code == 200
    assert result.json() == {
        "status": "disabled",
        "reason": "cams_snapshot_collection_not_enabled",
    }


def test_cams_snapshot_route_requires_exact_supabase_project(monkeypatch):
    monkeypatch.setattr(settings, "cron_secret", "cams-test-secret")
    monkeypatch.setattr(settings, "supabase_cron_secret", "")
    monkeypatch.setattr(settings, "cams_snapshot_collection_enabled", True)
    monkeypatch.setattr(
        settings, "cams_snapshot_expected_supabase_ref", "clearpath-ref"
    )
    monkeypatch.setattr(settings, "supabase_url", "https://other-ref.supabase.co")
    client = TestClient(app)
    result = client.get(
        "/api/cron/cams-snapshots",
        headers={"Authorization": "Bearer cams-test-secret"},
    )
    assert result.json() == {
        "status": "disabled",
        "reason": "supabase_project_ref_mismatch",
    }


def test_cams_retention_is_provider_scoped_and_bounded(monkeypatch):
    calls = []

    def delete(snapshot_cutoff, run_cutoff, *, batch_size):
        calls.append((snapshot_cutoff, run_cutoff, batch_size))
        return (batch_size, 0) if len(calls) == 1 else (3, 1)

    monkeypatch.setattr(supabase_client, "delete_cams_history_before", delete)
    result = provider_sync._cleanup_cams_history()
    assert result == {"deleted_snapshots": 1003, "deleted_runs": 1}
    assert len(calls) == 2
    assert all(batch_size == 1000 for _, _, batch_size in calls)


def test_cams_retention_uses_database_rpc_instead_of_uuid_url(monkeypatch):
    calls = []

    class RpcRequest:
        def execute(self):
            return SimpleNamespace(data={"deleted_snapshots": 1000, "deleted_runs": 2})

    class Client:
        def rpc(self, name, params):
            calls.append((name, params))
            return RpcRequest()

    monkeypatch.setattr(settings, "local_demo_mode", False)
    monkeypatch.setattr(supabase_client, "get_client", lambda: Client())

    result = supabase_client.delete_cams_history_before(
        "2026-10-20T00:00:00+00:00", "2026-09-27T00:00:00+00:00"
    )

    assert result == (1000, 2)
    assert calls == [
        (
            "prune_expired_cams_history",
            {
                "p_snapshot_cutoff": "2026-10-20T00:00:00+00:00",
                "p_run_cutoff": "2026-09-27T00:00:00+00:00",
                "p_batch_size": 1000,
            },
        )
    ]


def test_supabase_provider_writes_reject_silent_reset_trigger(monkeypatch):
    class EmptyWrite:
        def insert(self, _row):
            return self

        def upsert(self, _rows, *, on_conflict):
            assert on_conflict == "station_id,provider,issued_at,forecast_at"
            return self

        def execute(self):
            return SimpleNamespace(data=[])

    monkeypatch.setattr(settings, "local_demo_mode", False)
    monkeypatch.setattr(
        supabase_client,
        "get_client",
        lambda: SimpleNamespace(table=lambda _name: EmptyWrite()),
    )
    with pytest.raises(UpstreamError, match="forecast_provider_run_write_blocked"):
        supabase_client.create_provider_sync_run({"id": "test"})
    with pytest.raises(
        UpstreamError, match="forecast_provider_snapshot_write_incomplete"
    ):
        supabase_client.upsert_provider_snapshots([{"id": "test"}])
