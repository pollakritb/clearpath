from datetime import UTC, datetime, timedelta

import pytest

from backend.algorithms.trust import (
    evaluate_gratitude_eligibility,
    rating_matches_consensus,
    reviewer_weight,
    star_consensus,
    star_rating_direction,
)


def test_reviewer_weight_is_bounded():
    assert reviewer_weight(-100) == 1
    assert reviewer_weight(100) == 2
    assert reviewer_weight(1000) == 3


def test_consensus_needs_three_independent_raters_before_trust_adjustment():
    two = [
        {"reviewer_id": "a", "rating": 5, "weight": 1},
        {"reviewer_id": "b", "rating": 4, "weight": 2},
    ]
    assert star_consensus(two)["adjustment"] == 0
    three = [*two, {"reviewer_id": "c", "rating": 5, "weight": 3}]
    result = star_consensus(three)
    assert result["direction"] == "positive"
    assert 0 < result["adjustment"] <= 8


def test_duplicate_reviewer_does_not_inflate_consensus():
    result = star_consensus(
        [
            {"reviewer_id": "a", "rating": 1},
            {"reviewer_id": "a", "rating": 5},
            {"reviewer_id": "b", "rating": 5},
            {"reviewer_id": "c", "rating": 5},
        ]
    )
    assert result["count"] == 3
    assert result["direction"] == "positive"


def test_neutral_rating_never_matches_reward_consensus():
    assert rating_matches_consensus(5, "positive")
    assert rating_matches_consensus(1, "negative")
    assert not rating_matches_consensus(3, "positive")
    assert star_rating_direction(3) == "neutral"
    with pytest.raises(ValueError):
        star_rating_direction(0)


def test_gratitude_radius_and_freshness_boundaries_are_inclusive():
    now = datetime(2026, 9, 16, 12, 0, tzinfo=UTC)
    common = {
        "report_status": "approved",
        "is_self": False,
        "gps_accuracy_m": 200,
        "captured_at": (now - timedelta(minutes=180)).isoformat(),
        "now": now,
    }
    assert evaluate_gratitude_eligibility(**common, distance_km=3.0) == {
        "eligible": True,
        "reason_code": "eligible",
    }
    assert (
        evaluate_gratitude_eligibility(**common, distance_km=3.001)["reason_code"]
        == "outside_radius"
    )
    assert (
        evaluate_gratitude_eligibility(
            **{**common, "captured_at": (now - timedelta(minutes=181)).isoformat()},
            distance_km=3.0,
        )["reason_code"]
        == "report_expired"
    )


@pytest.mark.parametrize(
    ("overrides", "reason_code"),
    [
        ({"report_status": "pending"}, "report_not_approved"),
        ({"is_self": True}, "self_review"),
        ({"gps_accuracy_m": 200.1}, "gps_inaccurate"),
    ],
)
def test_gratitude_gate_reports_internal_reason_codes(overrides, reason_code):
    now = datetime(2026, 9, 16, 12, 0, tzinfo=UTC)
    values = {
        "report_status": "approved",
        "is_self": False,
        "distance_km": 0,
        "gps_accuracy_m": 20,
        "captured_at": now.isoformat(),
        "now": now,
        **overrides,
    }
    assert evaluate_gratitude_eligibility(**values) == {
        "eligible": False,
        "reason_code": reason_code,
    }
