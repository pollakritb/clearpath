from datetime import UTC, datetime, timedelta

from backend.services import local_store


def test_local_forecast_retention_cascades_predictions():
    old_id = "retention-old-run"
    new_id = "retention-new-run"
    local_store.insert_forecast_ledger(
        {
            "id": old_id,
            "generated_at": (datetime.now(UTC) - timedelta(days=500)).isoformat(),
        },
        [{"run_id": old_id, "horizon_hours": 1}],
    )
    local_store.insert_forecast_ledger(
        {"id": new_id, "generated_at": datetime.now(UTC).isoformat()},
        [{"run_id": new_id, "horizon_hours": 1}],
    )

    cutoff = (datetime.now(UTC) - timedelta(days=400)).isoformat()
    assert local_store.delete_forecast_runs_before(cutoff) == 1
    assert local_store.delete_forecast_runs_before(cutoff) == 0


def test_local_provider_retention_keeps_fresh_snapshots_and_running_runs():
    now = datetime.now(UTC)
    old_issued = (now - timedelta(days=8)).isoformat()
    fresh_issued = now.isoformat()
    local_store.upsert_provider_snapshots(
        [
            {
                "station_id": "retention-station",
                "provider": "openmeteo_cams",
                "issued_at": old_issued,
                "forecast_at": old_issued,
            },
            {
                "station_id": "retention-station",
                "provider": "openweather",
                "issued_at": fresh_issued,
                "forecast_at": fresh_issued,
            },
        ]
    )
    local_store.create_provider_sync_run(
        {
            "id": "retention-provider-old",
            "started_at": (now - timedelta(days=40)).isoformat(),
            "completed_at": (now - timedelta(days=40)).isoformat(),
        }
    )
    local_store.create_provider_sync_run(
        {
            "id": "retention-provider-running",
            "started_at": (now - timedelta(days=40)).isoformat(),
            "completed_at": None,
        }
    )

    deleted = local_store.delete_provider_history_before(
        (now - timedelta(days=7)).isoformat(),
        (now - timedelta(days=30)).isoformat(),
    )

    assert deleted == (1, 1)
    remaining = local_store.get_provider_snapshots("retention-station")
    assert [row["provider"] for row in remaining] == ["openweather"]
    assert any(
        row["id"] == "retention-provider-running"
        for row in local_store.list_provider_sync_runs()
    )
