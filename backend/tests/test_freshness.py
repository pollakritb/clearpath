from datetime import UTC, datetime, timedelta

from backend.algorithms.freshness import station_freshness


def test_station_freshness_surface_cutoff():
    now = datetime(2026, 7, 17, 12, tzinfo=UTC)
    fresh = station_freshness((now - timedelta(minutes=30)).isoformat(), now)
    delayed = station_freshness((now - timedelta(minutes=75)).isoformat(), now)
    expired = station_freshness((now - timedelta(minutes=91)).isoformat(), now)
    assert fresh["data_status"] == "fresh"
    assert delayed["data_status"] == "delayed"
    assert delayed["eligible_for_surface"] is True
    assert expired["eligible_for_surface"] is False
