"""Fictitious test radii exercise geometry, not recommendations for deployment."""

from datetime import UTC, datetime, timedelta
from math import degrees

import pytest

from backend.algorithms.distance import EARTH_RADIUS_KM
from backend.algorithms.reaction_location import reaction_eligibility
from backend.core.config import settings
from backend.services import local_store
from backend.services.community import engagement, policy_v2
from backend.tests.test_report_engagement import _approved_report

NOW = datetime(2026, 11, 5, 9, tzinfo=UTC)
REFERENCE = "test-fixture-only:not-a-field-validation"


def decide(distance=0, voter_error=5, report_error=5, radius=120, **overrides):
    report = dict(
        lat=0, lon=0, gps_accuracy_m=report_error, captured_at=NOW.isoformat()
    )
    fix = dict(
        lat=degrees(distance / (1000 * EARTH_RADIUS_KM)),
        lon=0,
        accuracy_m=voter_error,
        observed_at=NOW.isoformat(),
    )
    report.update(overrides.pop("report", {}))
    fix.update(overrides.pop("fix", {}))
    return reaction_eligibility(
        report,
        fix,
        now=NOW,
        radius_m=radius,
        reference=overrides.pop("reference", REFERENCE),
    )


@pytest.mark.parametrize(
    "distance,expected", [(100, None), (115, "gps_uncertain"), (131, "outside_area")]
)
def test_both_error_radii_included(distance, expected):
    assert decide(distance=distance) == expected


def test_boundary_is_inclusive_and_radius_is_configurable():
    assert decide(distance=0, voter_error=60, report_error=60) is None
    assert decide(distance=0, voter_error=60.001, report_error=60) == "gps_uncertain"
    assert decide(distance=80, radius=60) == "outside_area"
    assert decide(distance=80, radius=200) is None


@pytest.mark.parametrize(
    "radius,reference",
    [
        (None, REFERENCE),
        (120, None),
        (120, ""),
        (120, "  "),
        (0, REFERENCE),
        (-1, REFERENCE),
        (float("nan"), REFERENCE),
        (float("inf"), REFERENCE),
    ],
)
def test_no_invented_radius_or_reference(radius, reference):
    assert decide(radius=radius, reference=reference) == "policy_unvalidated"


@pytest.mark.parametrize(
    "field,value",
    [
        ("lat", float("nan")),
        ("lon", float("inf")),
        ("lat", 91),
        ("accuracy_m", -1),
        ("observed_at", "invalid"),
        ("observed_at", None),
    ],
)
def test_invalid_location_never_passes(field, value):
    assert decide(fix={field: value}) == "gps_invalid"


def test_unknown_report_accuracy_cannot_claim_inside():
    assert decide(report_error=None) == "report_location_unknown"
    assert decide(report_error=float("nan")) == "report_location_unknown"


def test_freshness_and_future_timestamp_rejected():
    assert (
        decide(fix={"observed_at": (NOW - timedelta(seconds=61)).isoformat()})
        == "gps_expired"
    )
    assert (
        decide(fix={"observed_at": (NOW + timedelta(seconds=1)).isoformat()})
        == "gps_expired"
    )
    assert (
        decide(report={"captured_at": (NOW - timedelta(hours=4)).isoformat()})
        == "report_expired"
    )


def test_private_report_location_checked_and_voter_gps_not_retained(monkeypatch):
    monkeypatch.setattr(settings, "local_demo_mode", True)
    monkeypatch.setattr(
        policy_v2,
        "release",
        lambda: dict(
            active_version="v2",
            reaction_radius_m=120,
            reaction_validation_ref=REFERENCE,
        ),
    )
    rid = _approved_report("owner-location-test")
    now = datetime.now(UTC).isoformat()
    local_store.update_report(
        rid,
        dict(
            lat=13.7,
            lon=100.5,
            gps_accuracy_m=5,
            public_lat=14,
            public_lon=101,
            captured_at=now,
        ),
    )
    fix = dict(lat=13.7, lon=100.5, accuracy_m=5, observed_at=now)
    result = engagement.set_reaction(rid, "voter-location-test", "like", fix, "useful")
    assert result["viewer_reaction"] == "like"
    stored = local_store.get_report_reaction(rid, "voter-location-test")
    assert not {"lat", "lon", "accuracy_m", "observed_at", "location"}.intersection(
        stored
    )
    assert stored["geofence_policy"].startswith("location-v2:")
    assert "trust_score" not in local_store.get_report(rid)
    with pytest.raises(ValueError, match="เหตุผล"):
        engagement.set_reaction(rid, "voter-location-test", "dislike", fix, "useful")
    # Withdrawal must work even without GPS or an enabled location policy.
    monkeypatch.setattr(
        policy_v2, "release", lambda: dict(active_version="v2", reaction_radius_m=None)
    )
    assert (
        engagement.clear_reaction(rid, "voter-location-test")["viewer_reaction"] is None
    )
    with pytest.raises(ValueError, match="รัศมี"):
        engagement.set_reaction(rid, "voter-location-test", "like", fix, "useful")
