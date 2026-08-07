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
