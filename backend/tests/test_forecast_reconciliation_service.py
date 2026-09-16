from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

from backend.services import forecast_reconciliation


def test_reconciliation_deduplicates_issue_hours_and_persists_every_slice(
    monkeypatch,
):
    target = date(2026, 9, 14)
    recorded_at = datetime(2026, 9, 14, 1, tzinfo=UTC).isoformat()
    rows = [
        {
            "station_id": "station-1",
            "recorded_at": recorded_at,
            "source_status": "invalid",
        },
        {
            "station_id": "station-1",
            "recorded_at": recorded_at,
            "source_status": "observed",
        },
        {"station_id": "station-1", "recorded_at": "invalid"},
    ]
    persisted: list[dict] = []
    monkeypatch.setattr(
        forecast_reconciliation.supabase_client,
        "get_stations",
        lambda: [{"id": "station-1"}, {"id": "station-2"}],
    )
    monkeypatch.setattr(
        forecast_reconciliation.supabase_client,
        "list_source_quality_rows",
        lambda _source, _start, _end: rows,
    )
    monkeypatch.setattr(
        forecast_reconciliation.supabase_client,
        "upsert_forecast_data_quality",
        lambda output: persisted.extend(output),
    )

    result = forecast_reconciliation.reconcile_day(target)

    assert result["sources"] == 4
    assert result["stations"] == 2
    assert result["rows"] == 8
    assert result["expected_hours"] == 192
    assert result["observed_hours"] == 4
    assert result["invalid_rows"] == 4
    assert len(persisted) == 8
    station_two = next(
        row
        for row in persisted
        if row["source_name"] == "pm25" and row["station_id"] == "station-2"
    )
    assert station_two["observed_hours"] == 0
    assert station_two["newest_source_at"] is None
    assert result["alert_codes"]


def test_future_reconciliation_date_has_zero_expected_hours(monkeypatch):
    future = datetime.now(UTC).date() + timedelta(days=1)
    persisted: list[dict] = []
    monkeypatch.setattr(
        forecast_reconciliation.supabase_client,
        "get_stations",
        lambda: [{"id": "station-1"}],
    )
    monkeypatch.setattr(
        forecast_reconciliation.supabase_client,
        "list_source_quality_rows",
        lambda *_args: [],
    )
    monkeypatch.setattr(
        forecast_reconciliation.supabase_client,
        "upsert_forecast_data_quality",
        lambda output: persisted.extend(output),
    )

    result = forecast_reconciliation.reconcile_day(future)
    assert result["expected_hours"] == 0
    assert all(row["missing_hours"] == 0 for row in persisted)
