from datetime import UTC, datetime, timedelta

from backend.algorithms.trust import (
    calculate_trust_score,
    is_nakhon_pathom_area,
    is_report_fresh,
    nearest_official_station,
    peer_adjustment,
)


def test_high_quality_report_scores_high():
    now = datetime.now(UTC).isoformat()
    result = calculate_trust_score(
        lat=13.8199,
        lon=100.0622,
        pm25=40,
        captured_at=now,
        capture_source="camera",
        ocr_pm25=40,
        ocr_confidence=0.95,
        device_detected=True,
        display_clear=True,
        official_stations=[{"lat": 13.76, "lon": 100.50, "pm25": 42}],
        reporter_reputation=100,
        admin_verified=True,
        capture_verified=True,
    )
    assert result["score"] >= 90
    assert result["reasons"]


def test_unverified_upload_scores_lower():
    result = calculate_trust_score(
        lat=0,
        lon=0,
        pm25=400,
        captured_at="not-a-date",
        capture_source="upload",
        ocr_pm25=None,
        ocr_confidence=0,
        device_detected=False,
        display_clear=False,
        official_stations=[],
        capture_verified=False,
        measurement_environment="indoor",
        measurement_stable=False,
    )
    assert result["score"] < 20


def test_nakhon_pathom_bounds_and_freshness():
    assert is_nakhon_pathom_area(13.8199, 100.0622)
    assert not is_nakhon_pathom_area(13.7563, 100.5018)
    assert is_report_fresh(datetime.now(UTC).isoformat())


def test_peer_adjustment_is_bounded():
    assert peer_adjustment(10, 0) == 8
    assert peer_adjustment(0, 10) == -8
    assert peer_adjustment(3, 3) == 0


def test_nearest_official_station_ignores_stale_readings():
    now = datetime(2026, 7, 16, 8, 0, tzinfo=UTC)
    stations = [
        {
            "station_id": "stale-nearby",
            "lat": 13.82,
            "lon": 100.06,
            "pm25": 20,
            "recorded_at": (now - timedelta(minutes=61)).isoformat(),
        },
        {
            "station_id": "fresh-farther",
            "lat": 13.84,
            "lon": 100.08,
            "pm25": 35,
            "recorded_at": (now - timedelta(minutes=30)).isoformat(),
        },
    ]

    nearest, distance = nearest_official_station(
        13.82, 100.06, stations, max_age_minutes=60, now=now
    )

    assert nearest is not None
    assert nearest["station_id"] == "fresh-farther"
    assert distance is not None and distance > 0
