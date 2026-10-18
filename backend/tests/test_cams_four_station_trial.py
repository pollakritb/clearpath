"""Read-only field-trial export must not turn label matches into accuracy claims."""

from datetime import UTC, datetime

import pytest

from backend.core.config import settings
from scripts.cams_four_station_trial import (
    candidate_pairs,
    checked_project_ref,
    normalize_snapshot,
    utc_time,
)


def test_snapshot_preserves_requested_and_grid_coordinates() -> None:
    row = {
        "station_id": "103t",
        "issued_at": "2026-10-17T00:00:00+00:00",
        "forecast_at": "2026-10-17T03:00:00+00:00",
        "pm25": 12.5,
        "unit": "µg/m³",
        "raw_metadata": {
            "requested_lat": 12.577835,
            "requested_lon": 99.953663,
            "grid_lat": 12.599998,
            "grid_lon": 100.0,
            "fetched_at": "2026-10-17T00:01:00+00:00",
            "issued_time_kind": "retrieved_at",
        },
    }
    normalized = normalize_snapshot(row)
    assert normalized is not None
    assert normalized["grid_distance_km"] == pytest.approx(5.6, abs=0.01)
    assert normalized["fetched_at_utc"] == "2026-10-17T00:01:00+00:00"
    assert normalized["issued_time_kind"] == "retrieved_at"


def test_pairing_only_finds_past_unscored_label_matches() -> None:
    now = datetime(2026, 10, 17, 4, tzinfo=UTC)
    base = {
        "station_id": "103t",
        "fetched_at_utc": "2026-10-17T00:00:00+00:00",
        "valid_at_utc": "2026-10-17T03:00:00+00:00",
        "lead_hours": 3.0,
        "pm25_ug_m3": 12.5,
    }
    observed = [
        {
            "source_label_as_utc": "2026-10-17T03:00:00+00:00",
            "source_label_local": "2026-10-17 10:00:00",
            "pm25_ug_m3": 18.0,
        }
    ]
    pairs = candidate_pairs(
        [
            base,
            {**base, "fetched_at_utc": "2026-10-17T03:01:00+00:00"},
            {**base, "valid_at_utc": "2026-10-17T05:00:00+00:00"},
        ],
        observed,
        now,
    )
    assert len(pairs) == 1
    assert pairs[0]["scorable"] is False
    assert pairs[0]["reason"] == "hourly_timestamp_window_semantics_unverified"
    assert "error" not in pairs[0]
    assert "mae" not in pairs[0]


def test_naive_timestamp_is_rejected() -> None:
    with pytest.raises(ValueError, match="timestamp_without_offset"):
        utc_time("2026-10-17T03:00:00")


def test_non_clearpath_project_is_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "supabase_url", "https://other.supabase.co")
    monkeypatch.setattr(settings, "supabase_service_role_key", "test-only")
    with pytest.raises(SystemExit, match="expected the configured ClearPath"):
        checked_project_ref()
