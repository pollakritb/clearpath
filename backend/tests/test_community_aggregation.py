from datetime import UTC, datetime, timedelta

from backend.algorithms.community_quality import aggregate_community_reports


def _report(report_id: str, user_id: str, pm25: float, **overrides):
    return {
        "id": report_id,
        "user_id": user_id,
        "status": "approved",
        "lat": 13.82,
        "lon": 100.06,
        "pm25": pm25,
        "trust_score": 80,
        "captured_at": datetime.now(UTC).isoformat(),
        "eligible_for_gap_fill": True,
        "gps_accuracy_m": 30,
        "device_calibrated": False,
        **overrides,
    }


def test_weighted_cluster_resists_single_high_outlier():
    rows = [
        _report("a", "a", 40),
        _report("b", "b", 42, trust_score=90),
        _report("c", "c", 49, trust_score=60),
    ]
    points = aggregate_community_reports(rows)
    assert len(points) == 1
    assert points[0]["pm25"] == 42
    assert points[0]["reporter_count"] == 3


def test_single_report_requires_calibrated_high_trust():
    assert aggregate_community_reports([_report("a", "a", 40)]) == []
    points = aggregate_community_reports(
        [_report("a", "a", 40, trust_score=80, device_calibrated=True)]
    )
    assert len(points) == 1


def test_expired_reading_is_excluded():
    old = datetime.now(UTC) - timedelta(minutes=181)
    rows = [_report("a", "a", 40, captured_at=old.isoformat(), device_calibrated=True)]
    assert aggregate_community_reports(rows) == []
