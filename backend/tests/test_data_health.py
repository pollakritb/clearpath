from datetime import UTC, datetime, timedelta

import pytest

from backend.algorithms.data_health import summarize_data_health
from backend.core.errors import UpstreamError
from backend.services import data_health

NOW = datetime(2026, 9, 16, 5, 0, tzinfo=UTC)


def station(minutes_old: int) -> dict:
    return {"recorded_at": (NOW - timedelta(minutes=minutes_old)).isoformat()}


def test_summary_reports_station_freshness_and_sync_duration():
    result = summarize_data_health(
        [station(10), station(70), station(120)],
        [
            {
                "status": "success",
                "started_at": (NOW - timedelta(seconds=3)).isoformat(),
                "completed_at": (NOW - timedelta(seconds=1)).isoformat(),
            }
        ],
        now=NOW,
    )

    assert result["status"] == "degraded"
    assert result["fresh_station_count"] == 1
    assert result["delayed_station_count"] == 1
    assert result["expired_station_count"] == 1
    assert result["stale_station_ratio"] == pytest.approx(0.6667)
    assert result["latest_sync_duration_ms"] == 2000
    assert result["alert_codes"] == ["stale_ratio_high"]


def test_summary_fails_closed_for_stale_data_and_failed_upstream():
    result = summarize_data_health(
        [station(120)],
        [
            {
                "status": "failed",
                "started_at": (NOW - timedelta(minutes=2)).isoformat(),
                "completed_at": (NOW - timedelta(minutes=1)).isoformat(),
                "error_message": "must never be returned",
            },
            {
                "status": "failed",
                "started_at": (NOW - timedelta(minutes=20)).isoformat(),
            },
        ],
        now=NOW,
    )

    assert result["status"] == "critical"
    assert result["upstream_failure"] is True
    assert result["consecutive_sync_failures"] == 2
    assert result["alert_codes"] == ["station_data_stale", "upstream_sync_failed"]
    assert "error_message" not in result


def test_summary_detects_missing_history_and_stuck_sync():
    missing = summarize_data_health([], [], now=NOW)
    assert missing["status"] == "critical"
    assert missing["alert_codes"] == ["station_data_missing", "sync_history_missing"]

    stuck = summarize_data_health(
        [station(5)],
        [
            {
                "status": "running",
                "started_at": (NOW - timedelta(minutes=16)).isoformat(),
            }
        ],
        now=NOW,
    )
    assert stuck["status"] == "degraded"
    assert stuck["alert_codes"] == ["sync_run_stuck"]


def test_service_returns_safe_upstream_error(monkeypatch):
    def fail():
        raise RuntimeError("secret database detail")

    monkeypatch.setattr(data_health.supabase_client, "get_stations", fail)
    with pytest.raises(UpstreamError, match="data_health_unavailable") as raised:
        data_health.get_data_health()
    assert "secret" not in str(raised.value)
