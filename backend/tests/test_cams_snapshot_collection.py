"""Storage-only CAMS collection must not resume the paused forecast pipeline."""

import asyncio
from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient

from backend.core.config import settings
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

    async def forecasts(_stations, *, forecast_hours):
        assert forecast_hours == 28
        return {
            "103t": [
                {
                    "forecast_at": (now + timedelta(hours=hour)).isoformat(),
                    "pm25": 12.5,
                    "source_lat": 13.8,
                    "source_lon": 100.6,
                    "fetched_at": now.isoformat(),
                }
                for hour in range(1, 29)
            ]
        }

    monkeypatch.setattr(provider_sync.openmeteo_air, "get_forecasts", forecasts)
    result = asyncio.run(provider_sync.collect_openmeteo_snapshots())

    assert result["status"] == "success"
    assert result["snapshot_count"] == 24
    assert len(saved) == 24
    assert {row["provider"] for row in saved} == {"openmeteo_cams"}
    assert saved[0]["raw_metadata"]["grid_lat"] == 13.8
    assert runs[0]["metadata"]["mode"] == "raw_cams_storage_only"
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

    async def forecasts(_stations, *, forecast_hours):
        assert forecast_hours == 28
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
