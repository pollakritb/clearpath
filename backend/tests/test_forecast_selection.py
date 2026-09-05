from datetime import UTC, datetime, timedelta

import pytest

from backend.algorithms.forecast_selection import (
    forecast_availability,
    provider_sync_due,
    select_external_forecast,
)


def test_external_selection_preserves_priority_provider_value():
    result = select_external_forecast(
        [
            {"source": "openweather", "pm25": 40},
            {"source": "openmeteo_cams", "pm25": 31},
            {"source": "gistda", "pm25": 27},
            {"source": "clearpath", "pm25": 99},
        ],
        1,
    )

    assert result is not None
    assert result["source"] == "gistda"
    assert result["pm25"] == 27
    assert result["provider_count"] == 3
    assert result["lower"] <= 27 <= result["upper"]


def test_external_selection_deduplicates_provider_and_rejects_invalid_values():
    result = select_external_forecast(
        [
            {"source": "openmeteo_cams", "pm25": 12},
            {"source": "openmeteo_cams", "pm25": 200},
            {"source": "openweather", "pm25": -1},
        ],
        3,
    )

    assert result is not None
    assert result["pm25"] == 12
    assert result["provider_count"] == 1


def test_availability_uses_external_data_even_when_local_history_is_unusable():
    status, reasons = forecast_availability(
        selected_sources=["openmeteo_cams"] * 24,
        max_provider_count=1,
        requested_hours=24,
        local_quality_sufficient=False,
    )

    assert status == "limited"
    assert reasons == ["single_external_provider"]


def test_availability_is_full_with_complete_multi_provider_evidence():
    status, reasons = forecast_availability(
        selected_sources=["gistda"] * 3 + ["openmeteo_cams"] * 21,
        max_provider_count=2,
        requested_hours=24,
        local_quality_sufficient=False,
    )

    assert status == "available"
    assert reasons == []


def test_availability_is_limited_when_providers_disagree():
    status, reasons = forecast_availability(
        selected_sources=["openmeteo_cams"] * 24,
        max_provider_count=2,
        requested_hours=24,
        local_quality_sufficient=True,
        low_agreement=True,
    )

    assert status == "limited"
    assert reasons == ["external_provider_disagreement"]


def test_availability_fails_closed_without_external_or_usable_local_data():
    assert forecast_availability(
        selected_sources=["clearpath"],
        max_provider_count=0,
        requested_hours=1,
        local_quality_sufficient=False,
    ) == (
        "unavailable",
        ["external_provider_unavailable", "local_inputs_unusable"],
    )


def test_provider_sync_is_due_without_a_previous_completed_run():
    assert provider_sync_due(None, 8)
    assert provider_sync_due({"status": "failed"}, 8)
    assert provider_sync_due({"status": "running"}, 8)
    assert provider_sync_due({"status": "success", "completed_at": "invalid"}, 8)


def test_provider_sync_uses_elapsed_time_instead_of_wall_clock_slot():
    now = datetime(2026, 9, 5, 12, tzinfo=UTC)
    recent = {
        "status": "success",
        "completed_at": (now - timedelta(hours=7, minutes=59)).isoformat(),
    }
    stale = {
        "status": "success",
        "completed_at": (now - timedelta(hours=8)).isoformat(),
    }

    assert not provider_sync_due(recent, 8, now=now)
    assert provider_sync_due(stale, 8, now=now)


def test_provider_sync_accepts_recent_partial_run_to_avoid_quota_storm():
    now = datetime(2026, 9, 5, 12, tzinfo=UTC)
    latest = {
        "status": "partial",
        "started_at": (now - timedelta(hours=1)).isoformat(),
    }

    assert not provider_sync_due(latest, 8, now=now)


def test_provider_sync_rejects_non_positive_interval():
    with pytest.raises(ValueError, match="provider_sync_interval_must_be_positive"):
        provider_sync_due(None, 0)
