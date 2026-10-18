"""The four-station trial is separate from Production forecast persistence."""

import asyncio
from datetime import UTC, datetime

import pytest

from backend.core.config import settings
from scripts import collect_independent_cams_trial as trial


def test_six_hour_slot_and_append_only_output(tmp_path) -> None:
    now = datetime(2026, 10, 18, 14, 23, tzinfo=UTC)
    assert trial._slot(now).isoformat() == "2026-10-18T12:00:00+00:00"
    evidence = {
        "collection_slot_utc": trial._slot(now).isoformat(),
        "stations": [{"station_id": "103t", "forecast_hour_count": 24}],
    }
    saved = trial.save(evidence, tmp_path)
    assert saved["production_supabase_access"] is False
    assert (tmp_path / "trial-20261018T120000Z.json").exists()
    with pytest.raises(FileExistsError):
        trial.save(evidence, tmp_path)


def test_collector_refuses_production_runtime(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "app_environment", "production")
    with pytest.raises(RuntimeError, match="refuses_production_runtime"):
        asyncio.run(trial.collect(datetime(2026, 10, 18, 12, tzinfo=UTC)))


def test_station_coordinates_and_ids_are_fixed() -> None:
    assert trial.STATION_IDS == ("103t", "73t", "78t", "102t")
    assert len({(row["lat"], row["lon"]) for row in trial.STATIONS}) == 4
