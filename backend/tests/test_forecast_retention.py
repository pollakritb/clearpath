from datetime import UTC, datetime, timedelta

from backend.services import local_store


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
                "provider": "openmeteo_cams",
                "issued_at": fresh_issued,
                "forecast_at": fresh_issued,
            },
        ]
    )
    local_store.create_provider_sync_run(
        {
            "id": "retention-provider-old",
            "provider": "openmeteo_cams",
            "started_at": (now - timedelta(days=40)).isoformat(),
            "completed_at": (now - timedelta(days=40)).isoformat(),
        }
    )
    local_store.create_provider_sync_run(
        {
            "id": "retention-provider-running",
            "provider": "openmeteo_cams",
            "started_at": (now - timedelta(days=40)).isoformat(),
            "completed_at": None,
        }
    )

    deleted = local_store.delete_cams_history_before(
        (now - timedelta(days=7)).isoformat(),
        (now - timedelta(days=30)).isoformat(),
    )

    assert deleted == (1, 1)
    remaining = local_store.get_recent_cams_snapshots(
        "retention-station", old_issued, old_issued
    )
    assert [row["provider"] for row in remaining] == ["openmeteo_cams"]
    assert any(
        row["id"] == "retention-provider-running"
        for row in local_store.list_provider_sync_runs()
    )
