"""Retired quality reconciliation and export must not query removed tables."""

from datetime import date
from pathlib import Path

import pytest

from backend.services import forecast_reconciliation, supabase_client
from scripts import export_forecast_training


def test_retired_quality_and_feature_reads_do_not_open_database(monkeypatch):
    def forbidden(*_args, **_kwargs):
        raise AssertionError("retired feature storage must not be queried")

    monkeypatch.setattr(supabase_client, "get_client", forbidden)
    result = forecast_reconciliation.reconcile_day(date(2026, 11, 1))
    assert result == {"status": "retired", "rows": 0, "alert_codes": []}
    assert supabase_client.get_latest_forecast_features("02t") == {}
    with pytest.raises(ValueError, match="live_export_retired"):
        export_forecast_training.export("2026-11-01T00:00:00Z", Path("unused.csv"))
